# MA-1 placement slice: create doors, windows, roofs and ceilings (+ Mark, Structural) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A reviewed changeset can **create** a door, a window, a flat roof and a ceiling, and any created element can carry
its **Mark** (and a floor its **Structural** flag). Drill B35's whole seed then becomes one command and one Review AI
Proposals, and every later drill and Build from Evidence can place these four kinds through the same governed path.

**Chosen by:** the founder, 2026-09-30: "build placement first" (so B35's seed is one script, not an afternoon of hand
placement). Source of truth for the direction: `docs/strategy/2026-09-30-model-automation-design.md` §2.2 row 6 (`:241`),
§7.2 MA-1 (1b) GHB-1 (`:1056`). B35 set-up: `docs/superpowers/plans/2026-09-30-promote-v1-whole-elements.md` §6 (`:708-772`).

**Principles (non-negotiable, as MA-0 and Promote v1):** exact or a person (D16) — never guess a type, a level or a host;
Sentinel loads no families and creates no types (a missing one is a named refusal); nothing changes until a person ticks;
one changeset = one transaction = one Undo; every created element stamped (`ProvenanceStamp.Write`, unchanged); ledger rows
unchanged (`changeset_proposed` / `_applied` / `_reverted`); every refusal in words; caps at the bridge. **Promote behaviour
does not change**: `RetypeTarget`, `Unsafe`, `Target`, the retype and attach loops, `PreTick`, both planners and the
`promote-body*.json` fixtures stay as they are, and promote-check's existing checks stay green.

**Global constraints for the implementer:**
- Branch `feature/ma1-placement-slice` from master; merge `--no-ff`. Never touch master directly, never push.
- The add-in builds for Revit 2024 (net48) and 2026 (net8): `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false`
  and the same with `-p:RevitVersion=2026`. No `string.Contains(char)`, no `^1` index (net48). Use the Edit tool for C# strings with escapes.
- Never deploy the add-in, never start or drive Revit, never run or restart a bridge: tests only. No network.
- No new dependencies. Match the surrounding idiom and comment density. Smallest correct diff.
- WebApp tests in a git worktree need `node_modules` as a directory **junction** (never a copy; never delete it or anything through it):
  `cmd /c mklink /J "<worktree>\WebApp\node_modules" "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project\WebApp\node_modules"`. Report that you made it.
- After each code task: `graphify update .` (per `C:/Users/yazan/CLAUDE.md`; if the CLI is not on PATH, say so and move on).
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens). Never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## 0. Decisions taken here (engineering, not founder policy; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| P1 | **Host rule.** A door's or window's host is the ONE wall that is Basic, not a stacked-wall member, straight (`LocationCurve` is a `Line`), based on the named level, and whose location line (the segment, clamped to its ends) passes within **1 mm** of `place.Location` in plan. None or more than one → refusal in words, never the nearest | The proposal puts the point ON the line; 1 mm absorbs rounding only. Ceiling: a door in a wall based on another storey, in a stacked or curtain wall, or in an arc wall is refused — widen when evidence needs it |
| P2 | `place.Location` z must equal the named level's elevation (±0.5 mm, the executor's `TolFt`). A window's sill is only `place.SillHeight` | A z that silently means "sill" to one agent and "level" to another is a guess. Same frame as the walls' z today (`level.Elevation`) |
| P3 | `place.Boundary` is plan `[[x,y],…]` mm, 3–256 points, an optional closing point equal to the first; every edge ≥ 1 mm; never doubles back; no two non-adjacent edges cross or touch; encloses ≥ 1 mm². **Checked at the bridge only** (`outlineProblem`) — the bridge is the only door into a changeset; the executor drops the closing point and builds lines | Revit refuses lines under ~0.8 mm and self-crossing sketches with a transaction failure; the bridge says which edge in words first |
| P4 | Ceiling `place.Offset` (mm above its level) is **required**; roof `place.BaseOffset` optional (0 = on its level); window `place.SillHeight` optional (the family's default) | A ceiling at "whatever Revit defaults to" is a guess; a roof on its level and a family's own sill are not |
| P5 | Roofs are **flat**: `NewFootPrintRoof`, then every footprint edge `DefinesSlope = false` | Slopes are a later field (MA-6), never implied |
| P6 | Types for a create: door/window by `place.FamilyName` + `place.TypeName` (a `FamilySymbol` of `OST_Doors`/`OST_Windows`); roof by `TypeName` among `OST_Roofs` types (must be a `RoofType`); ceiling by `TypeName` among `OST_Ceilings` types. Exact, case-insensitive; 0 → "load it (Sentinel loads no families and creates no types)"; >1 → "a person decides". System family names are never compared (translated in non-English Revit). A new `CreateType` helper; `RetypeTarget` is not touched | Keeps Promote unchanged; the same D16 wording as `ResolveWallType` |
| P7 | `place.Mark` (`ALL_MODEL_MARK`) on any create but a level or grid; `place.Structural` (`FLOOR_PARAM_IS_STRUCTURAL`) on floors only; `FlipFacing`/`FlipHand` on doors/windows; `SillHeight` windows; `BaseOffset` roofs; `Offset` ceilings; `Location` doors/windows; `Boundary` roofs/ceilings. A field on a kind that does not take it is a **400**, never ignored | A level's or grid's name is `identity.Name`; a silently ignored field is a lie to the reviewer |
| P8 | Order inside the one transaction: levels, grids, walls, floors, **roofs, ceilings, then `Regenerate` and doors + windows** (so an opening may host on a wall of the same changeset), then retype, attach (unchanged). The "every ticked element handled" guard (`ChangesetExecutor.cs:313-317`) stays | One Undo; all-or-nothing |
| P9 | Caps: `MAX_BOUNDARY_POINTS = 256`, `MAX_OFFSET_MM = 100000` (offsets within ±, sill 0…), text ≤ 256; elements ≤ 200 unchanged | Garbage guards, not design limits |
| P10 | The B35 seed is ONE changeset (19 elements) from `make-concept.py --b35`; type names default to §6.3's and are renamed with `--type DEFAULT=NAME`; the roof level is `--roof-level` (default `MA0 Roof`). The MA-0, `--skip-walls --floor…` and `--sheet` outputs stay byte-identical | One Undo for the whole seed; a founder rename (§6.1 step 4) is one flag |

---

## 1. What exists (master 9c67565) and what changes

| Piece | Today | This slice |
|---|---|---|
| `WebApp/bridge/changesets-logic.mjs` | `VOCABULARY` = wall, floor, level, grid (`:9`); `OP_KINDS.create = VOCABULARY` (`:15`); `checkPlace` per kind (`:26-46`); TypeName for wall/floor creates (`:73-75`) | `VOCABULARY` + roof, ceiling, door, window; `outlineProblem` (pure, exported); the per-kind field table; checks for the new place shapes; `MAX_BOUNDARY_POINTS`, `MAX_OFFSET_MM` |
| `WebApp/bridge/mcp-server.mjs` | `sentinel_propose_changeset` description names "v1 element kinds: wall, floor, level, grid" (`:101`) | Names the eight kinds and the new place fields |
| `SentinelAddin/GhostBuilder/PlacementGeometry.cs` | — | **New**, pure (no Revit API): `Host` (the one wall under a point) + `Distance` |
| `SentinelAddin/Coordination/ChangesetClient.cs` | `PlaceDto` (`:23-37`) | + `Location`, `SillHeight`, `FlipFacing`, `FlipHand`, `Boundary`, `BaseOffset`, `Offset`, `Mark`, `Structural` |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` | create: level, grid, wall, floor (`:207-265`) | + roof, ceiling, door, window loops; `CreateType`, `Outline`, `SetMark`; Mark on walls/floors, Structural on floors; `Set` overloads for text/int with the kind in the message |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | create label `kind: name · type · level` (`:128`) | `CreateLabel`: family : type, level, sill/offset/base offset, structural, Mark when it differs from the name — v1 rows read exactly as before |
| `tools/promote-check` | 71 MA-0 + Promote v1 checks | + `Placement.cs`: host finder cases; the B35 seed fixture read into the DTOs, every opening finding its §6.3 wall |
| `demo/promote-sample/make-concept.py` | MA-0 walls; `--skip-walls --floor…`; `--sheet` | + `--b35`, `--type`, `--roof-level` (old outputs byte-identical) |
| `WebApp/bridge/fixtures/changeset-ops/b35-seed-body.json` | — | **New**, generated by `make-concept.py --b35`; read by vitest and promote-check |

Unchanged and reused as they are: `Commands.ReviewChangesets.cs`, `ChangesetPlacementEvent.cs`, `Engine/ProvenanceStamp.cs` (any
element), `Engine/UndoWatcher.cs` (transaction name), `changesets-store.mjs` (adjudication, ledger rows), everything Promote.

---

## 2. The new place shapes (contract; the bridge checks them, the DTO reads them)

| Kind (create) | Required | Optional |
|---|---|---|
| `door` | `FamilyName`, `TypeName`, `LevelName` (text ≤ 256), `Location` [x,y,z] finite (z = the level's elevation) | `FlipFacing`, `FlipHand` (booleans), `Mark` |
| `window` | as a door | `SillHeight` (0…100000 mm), `FlipFacing`, `FlipHand`, `Mark` |
| `roof` | `TypeName`, `LevelName`, `Boundary` (P3) | `BaseOffset` (±100000 mm), `Mark` |
| `ceiling` | `TypeName`, `LevelName`, `Boundary` (P3), `Offset` (±100000 mm) | `Mark` |
| `wall` | as today | + `Mark` |
| `floor` | as today | + `Mark`, `Structural` (boolean) |
| `level`, `grid` | as today | nothing new (`Mark` → 400) |

```json
{ "kind": "door", "validate": { "identity": { "Class": "IfcDoor", "Name": "MA1-D01" } },
  "place": { "LevelName": "GR-FFL", "FamilyName": "M_Single-Flush", "TypeName": "MA1 1000 x 2100mm", "Location": [8000, 2250, 0.0], "Mark": "MA1-D01" } }
{ "kind": "ceiling", "validate": { "identity": { "Class": "IfcCovering", "Name": "MA1-C01" } },
  "place": { "LevelName": "GR-FFL", "TypeName": "MA1 Ceiling - 50mm", "Boundary": [[0, 0], [4000, 0], [4000, 4500], [0, 4500]], "Offset": 2700, "Mark": "MA1-C01" } }
```

IFC classes as Promote's `PromoteWallsPlanner.Classes` (`:91-92`): IfcRoof, IfcCovering, IfcDoor, IfcWindow.

---

## 3. The pure helpers and their offline tests

### 3.1 `outlineProblem(boundary)` — bridge, JS (`changesets-logic.mjs`, exported; vitest)

```js
export const MAX_BOUNDARY_POINTS = 256;
export const MAX_OFFSET_MM = 100000;
const MIN_EDGE_MM = 1; // Revit refuses a line shorter than about 0.8 mm

const xy = (p) => Array.isArray(p) && p.length === 2 && p.every(finite);
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const within = (a, b, p) => Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
/** Whether segments ab and cd share any point: a crossing, a touch or a collinear overlap. */
function meet(a, b, c, d) {
  const d1 = Math.sign(cross(a, b, c)), d2 = Math.sign(cross(a, b, d)), d3 = Math.sign(cross(c, d, a)), d4 = Math.sign(cross(c, d, b));
  if (d1 !== d2 && d3 !== d4) return true;
  return (d1 === 0 && within(a, b, c)) || (d2 === 0 && within(a, b, d)) || (d3 === 0 && within(c, d, a)) || (d4 === 0 && within(c, d, b));
}

/** MA-1: a roof's or ceiling's outline in plan, [[x,y],…] mm, a closing point equal to the first allowed: why Revit could not
 *  sketch it as one simple closed loop, or null. Exact arithmetic on the numbers sent. ponytail: O(n²) pair test, fine at 256
 *  points x 200 elements; a sweep if outlines ever grow. */
export function outlineProblem(b) {
  if (!Array.isArray(b) || b.length < 3 || b.length > MAX_BOUNDARY_POINTS || !b.every(xy)) return `must be 3 to ${MAX_BOUNDARY_POINTS} finite [x,y] points`;
  const n = b.length - (b[0][0] === b.at(-1)[0] && b[0][1] === b.at(-1)[1] ? 1 : 0);
  if (n < 3) return "needs 3 points besides a closing one";
  const at = (i) => b[i % n];
  for (let i = 0; i < n; i++)
    if (Math.hypot(at(i + 1)[0] - at(i)[0], at(i + 1)[1] - at(i)[1]) < MIN_EDGE_MM) return `has an edge shorter than ${MIN_EDGE_MM} mm, Boundary[${i}]→[${(i + 1) % n}]`;
  for (let i = 0; i < n; i++) {
    const [p, q, r] = [at(i + n - 1), at(i), at(i + 1)];
    if (cross(p, q, r) === 0 && (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]) < 0) return `doubles back on itself at Boundary[${i}]`;
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++)
      if (!(i === 0 && j === n - 1) && meet(at(i), at(i + 1), at(j), at(j + 1)))
        return `crosses or touches itself: Boundary[${i}]→[${(i + 1) % n}] and [${j}]→[${(j + 1) % n}]`;
  // Last: a symmetric bow-tie's signed area cancels to 0, so the crossing test must speak first.
  let area2 = 0;
  for (let i = 0; i < n; i++) area2 += cross([0, 0], at(i), at(i + 1));
  if (Math.abs(area2) < 2) return "encloses less than 1 mm²";
  return null;
}
```

(Run on the table below while this plan was written: every row gives the answer shown; 200 outlines of 256 points took ~75 ms.)

**vitest cases** (`describe("outlineProblem (MA-1)")`):

| Input | Expect |
|---|---|
| square `[[0,0],[4000,0],[4000,4500],[0,4500]]`, and the same + closing `[0,0]` | `null` both |
| triangle; L-shape `[[0,0],[6000,0],[6000,2000],[2000,2000],[2000,6000],[0,6000]]` | `null` |
| 256-point regular polygon, r = 5000 | `null` (and fast) |
| 257 points; 2 points; `[[0,0,0],…]` (3-D); a `NaN`; `"x"`; `undefined` | `/3 to 256 finite \[x,y\]/` |
| `[[0,0],[10,0],[0,0]]` (closing point leaves 2) | `/3 points besides a closing one/` |
| consecutive duplicate `[[0,0],[0,0],[10,0],[10,10]]`; an edge of 0.5 mm | `/shorter than 1 mm, Boundary\[0\]→\[1\]/` |
| collinear `[[0,0],[5000,0],[10000,0]]` | `/doubles back on itself at Boundary\[0\]/` |
| spike `[[0,0],[10000,0],[5000,0],[5000,5000]]` | `/doubles back on itself at Boundary\[1\]/` |
| bow-tie `[[0,0],[10,0],[0,10],[10,10]]` (area cancels) and `[[0,0],[20,0],[0,10],[5,10]]` | `/crosses or touches itself: Boundary\[1\]→\[2\] and \[3\]→\[0\]/` both |
| vertex on a non-adjacent edge `[[0,0],[20,0],[20,10],[10,0],[0,10]]` | `/crosses or touches itself: Boundary\[0\]→\[1\] and \[2\]→\[3\]/` |
| sliver `[[0,0],[1000,0],[500,0.001]]` | `/encloses less than 1 mm²/` |

### 3.2 `PlacementGeometry.Host` — add-in, C# pure (`SentinelAddin/GhostBuilder/PlacementGeometry.cs`; promote-check)

```csharp
#nullable disable
// MA-1: pure placement geometry for changeset creates — no Revit, so promote-check tests it offline. Millimetres, plan (x, y).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder;

public static class PlacementGeometry
{
    /// <summary>How far a door's or window's point may lie from its host wall's location line (mm): the proposal puts it ON
    /// the line, this absorbs rounding only.</summary>
    public const double HostTolMm = 1.0;

    /// <summary>The one wall on <paramref name="level"/> whose location line passes within HostTolMm of (x, y): its index in
    /// <paramref name="walls"/>, or -1 with <paramref name="why"/> in words. None, or more than one (a junction, a duplicate
    /// wall), is a refusal — Sentinel never guesses a host. Level names compare as Revit's do (case-insensitive).</summary>
    public static int Host(IReadOnlyList<(string Label, string Level, double X0, double Y0, double X1, double Y1)> walls,
                           string level, double x, double y, out string why)
    {
        var hits = Enumerable.Range(0, walls.Count)
            .Where(i => string.Equals(walls[i].Level, level, StringComparison.OrdinalIgnoreCase)
                        && Distance(walls[i].X0, walls[i].Y0, walls[i].X1, walls[i].Y1, x, y) <= HostTolMm)
            .ToList();
        var at = $"within {Mm(HostTolMm)} mm of ({Mm(x)}, {Mm(y)})";
        why = hits.Count == 1 ? null
            : hits.Count == 0 ? $"no straight wall on {level} passes {at} — re-propose the point on one wall's location line"
            : $"{hits.Count} walls on {level} pass {at}: {string.Join(", ", hits.Select(i => walls[i].Label))} — a person decides the host";
        return hits.Count == 1 ? hits[0] : -1;
    }

    /// <summary>Distance (mm) from (x, y) to the segment — clamped to its ends, so a point past a wall's end is not on it.</summary>
    internal static double Distance(double x0, double y0, double x1, double y1, double x, double y)
    {
        double dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
        var t = len2 == 0 ? 0 : Math.Max(0, Math.Min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        double px = x0 + t * dx - x, py = y0 + t * dy - y;
        return Math.Sqrt(px * px + py * py);
    }

    private static string Mm(double mm) => mm.ToString("0.#", CultureInfo.InvariantCulture);
}
```

**promote-check cases** (`tools/promote-check/Placement.cs`, `static void PlacementChecks()`), over `SeedWalls()` — the MA-0
seed's 20 walls per storey from `make-concept.py` (`EXTERIOR`, `INTERIOR`, `GAP`), labels `MA0-L1-E01…`, levels `GR-FFL` and `01-FFL`:

| Call `H(level, x, y)` | Expect |
|---|---|
| `GR-FFL, 8000, 2250` | `MA0-L1-I02` |
| `GR-FFL, 8000.6, 2250` | `MA0-L1-I02` (within 1 mm) |
| `GR-FFL, 8002, 2250` | exactly `no straight wall on GR-FFL passes within 1 mm of (8002, 2250) — re-propose the point on one wall's location line` |
| `01-FFL, 8000, 2250` | `MA0-L2-I02` — the same plan point on the other storey, never GR-FFL's |
| `gr-ffl, 8000, 2250` | `MA0-L1-I02` (case-insensitive level) |
| `GR-FFL, 8000, 5000` | starts `no straight wall on GR-FFL` — past I02's end (y 4500), clamped |
| `GR-FFL, 8000, 0` | exactly `2 walls on GR-FFL pass within 1 mm of (8000, 0): MA0-L1-E01, MA0-L1-I02 — a person decides the host` |
| `GR-FFL, 12000, 0` | starts `3 walls` (E01's end, E02's start, I03) |
| `MA0 Roof, 8000, 2250` | starts `no straight wall on MA0 Roof` |
| empty list | `-1`, `why != null`, no throw |

(The same distance rule, run in Python over `make-concept.py`'s own wall lists while this plan was written, gives every row
above and one wall per §6.3 opening: D01 I02, D02 I07, D03 E01, D04 I03, D05 I04, D06 L2-I02, W01 E03, W02 E05, W03 E06.)

```csharp
// The MA-0 seed's walls (demo/promote-sample/make-concept.py EXTERIOR, INTERIOR, GAP) on both storeys, as the executor passes them.
static List<(string Label, string Level, double X0, double Y0, double X1, double Y1)> SeedWalls()
{
    (int, int, int, int)[] ext = { (0, 0, 12000, 0), (12000, 0, 24000, 0), (24000, 0, 24000, 6000), (24000, 6000, 24000, 12000),
                                   (24000, 12000, 12000, 12000), (12000, 12000, 0, 12000), (0, 12000, 0, 6000), (0, 6000, 0, 0) };
    var xs = new[] { 4000, 8000, 12000, 16000, 20000 };
    var inner = xs.Select(x => (x, 0, x, 4500)).Concat(xs.Select(x => (x, 7500, x, 12000))).ToArray();
    (int, int, int, int)[] gap = { (2000, 6000, 6000, 6000), (18000, 6000, 22000, 6000) };
    var walls = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>();
    foreach (var (tag, level) in new[] { ("L1", "GR-FFL"), ("L2", "01-FFL") })
        foreach (var (p, segs) in new[] { ("E", ext), ("I", inner), ("G", gap) })
            for (var i = 0; i < segs.Length; i++)
                walls.Add(($"MA0-{tag}-{p}{i + 1:00}", level, segs[i].Item1, segs[i].Item2, segs[i].Item3, segs[i].Item4));
    return walls;
}
```

---

## 4. Tasks, in order

### Task 1 — Bridge: the four kinds, the field table, `outlineProblem`

**Files:** `WebApp/bridge/changesets-logic.mjs`, `WebApp/bridge/changesets-logic.test.mjs`, `WebApp/bridge/mcp-server.mjs`, `WebApp/bridge/mcp-server.test.mjs`.

1. `:9` → `export const VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window"];` with a comment
   "MA-1 placement slice: roof, ceiling, door, window". `OP_KINDS` (`:15`) is unchanged (`create: VOCABULARY`). After `:17` add
   `MAX_BOUNDARY_POINTS`, `MAX_OFFSET_MM`; after `:24` the helpers and `outlineProblem` of §3.1, plus:
   ```js
   const inRange = (n, lo, hi) => finite(n) && n >= lo && n <= hi;
   // MA-1: the create place fields and the kinds that take them — a field on any other kind is a 400, never ignored (a level's
   // or grid's name is identity.Name, so it has no Mark).
   const PLACE_FIELDS = {
     Mark: ["wall", "floor", "roof", "ceiling", "door", "window"], Structural: ["floor"],
     Location: ["door", "window"], FlipFacing: ["door", "window"], FlipHand: ["door", "window"], SillHeight: ["window"],
     Boundary: ["roof", "ceiling"], BaseOffset: ["roof"], Offset: ["ceiling"],
   };
   ```
2. `checkPlace` (`:28-46`): after the `place is required` line —
   ```js
   for (const [f, kinds] of Object.entries(PLACE_FIELDS))
     if (place[f] !== undefined && !kinds.includes(kind)) throw err(400, `${at}: a ${kind} takes no place.${f}`);
   if (place.Mark !== undefined && !text(place.Mark, 256)) throw err(400, `${at}: place.Mark must be text of at most 256 characters`);
   for (const f of ["Structural", "FlipFacing", "FlipHand"])
     if (place[f] !== undefined && typeof place[f] !== "boolean") throw err(400, `${at}: place.${f} must be true or false`);
   ```
   and after the `level` branch (`:43-45`):
   ```js
   } else if (kind === "door" || kind === "window") {
     if (!point(place.Location)) throw err(400, `${at}: a ${kind} needs place.Location, the finite [x,y,z] point on its host wall's location line (z = its level's elevation)`);
     if (place.SillHeight !== undefined && !inRange(place.SillHeight, 0, MAX_OFFSET_MM)) throw err(400, `${at}: place.SillHeight must be a number of mm from 0 to ${MAX_OFFSET_MM}`);
   } else if (kind === "roof" || kind === "ceiling") {
     const why = outlineProblem(place.Boundary);
     if (why) throw err(400, `${at}: ${kind} place.Boundary ${why}`);
     const f = kind === "roof" ? "BaseOffset" : "Offset";
     if ((kind === "ceiling" || place[f] !== undefined) && !inRange(place[f], -MAX_OFFSET_MM, MAX_OFFSET_MM))
       throw err(400, `${at}: ${kind === "ceiling" ? "a ceiling needs " : ""}place.${f}, a number of mm within ±${MAX_OFFSET_MM}`);
   }
   ```
3. The create requirements (`:71-75`) become:
   ```js
   // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
   if (el.kind !== "level" && el.kind !== "grid" && !text(el.place.TypeName, 256))
     throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
   if ((el.kind === "door" || el.kind === "window") && !text(el.place.FamilyName, 256))
     throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
   if (["roof", "ceiling", "door", "window"].includes(el.kind) && !text(el.place.LevelName, 256))
     throw err(400, `${at}: a ${el.kind} needs place.LevelName — Sentinel never picks its level`);
   ```
4. `mcp-server.mjs:101`: replace "v1 element kinds: wall, floor, level, grid." … "Walls and floors also need place.TypeName, the exact
   name of a type already loaded in the model — Sentinel never takes the model's first type and creates no types." with:
   "Element kinds: wall, floor, level, grid, roof, ceiling, door, window. Geometry in millimetres, project-internal coordinates:
   walls/grids need place.LocationCurve {start:[x,y,z], end:[x,y,z]}; floors place.LocationLoop [[x,y,z]×≥3]; levels
   place.BaseElevation; roofs and ceilings place.LevelName and place.Boundary, one simple closed outline [[x,y]×3–256] (a roof
   is flat, optional place.BaseOffset; a ceiling needs place.Offset, its height above the level); doors and windows
   place.FamilyName, place.LevelName and place.Location [x,y,z], a point on the location line of exactly one wall of that level,
   z = the level's elevation (a window: optional place.SillHeight; both: optional place.FlipFacing, place.FlipHand). Every kind
   but a level or grid also needs place.TypeName, the exact name of a type already loaded in the model — Sentinel never takes
   the model's first type, loads no families and creates no types — and may carry place.Mark; a floor may carry
   place.Structural (true/false)." (Keep the rest of the string: element shape, ops, reason.)

**vitest** (`changesets-logic.test.mjs`): hoist `status400` (`:210-213`) to module scope. Update `:22-24` ("is the frozen v1
list" → "is the MA-1 list", the eight kinds), `:53` and `:267` (use `kind: "column"` as the unsupported kind; `:267` expects
`/kind "column" is not supported — allowed: wall, floor, level, grid, roof, ceiling, door, window/`), `:215-218` (VOCABULARY is
the MA-1 list). `:221` (`OP_KINDS`) passes unchanged. Add §3.1's table, and `describe("validateChangeset — MA-1 creates")` with
builders `door()`, `win()`, `roof()`, `ceiling()` (the §2 shapes; a window at `[24000, 3000, 0]` sill 900, a roof on `MA0 Roof`):

| Case | Expect |
|---|---|
| each valid builder | passes; `el.place` `toEqual` the sent place; `op: "create"`, `target: null` |
| door/window without `FamilyName` / `TypeName` / `LevelName` / `Location`; `Location` `[1,2]` or `[NaN,0,0]` | 400 naming the field |
| window `SillHeight` `-1`, `100001`, `"900"` | 400 `/SillHeight must be a number of mm from 0 to 100000/`; `0` and `100000` pass |
| door with `SillHeight` | 400 `/a door takes no place\.SillHeight/` |
| `FlipFacing: "yes"` | 400 `/must be true or false/`; `true`/`false` pass on doors and windows |
| roof with `FlipFacing`; roof with `Offset`; ceiling with `BaseOffset`; wall with `Location`; floor with `Boundary` | 400 `/a <kind> takes no place\.<field>/` |
| roof/ceiling without `Boundary`; bow-tie `Boundary` | 400 `/place\.Boundary must be 3 to 256/`, `/place\.Boundary crosses or touches itself/` |
| ceiling without `Offset`; `Offset: 1e6` | 400 `/a ceiling needs place\.Offset/` |
| roof `BaseOffset: -300` passes; `"0"` | 400 `/place\.BaseOffset/` |
| roof/ceiling/door/window without `LevelName` | 400 `/needs place\.LevelName/`; a floor without it still passes (unchanged: nearest level) |
| `Mark` on wall, floor, roof, ceiling, door, window | passes and is kept |
| `Mark` on a level; on a grid; `Mark: ""`; `Mark: 5`; 257 characters | 400 (`/a level takes no place\.Mark/`, `/place\.Mark must be text/`) |
| floor `Structural: true` / `false` | passes; `"true"` → 400; wall `Structural` → `/a wall takes no place\.Structural/` |

`mcp-server.test.mjs:147`: keep `/wall, floor, level, grid/`, add `toMatch(/roof, ceiling, door, window/)` and `toMatch(/place\.Boundary/)`.

**Commands:** junction (Global constraints); `cd WebApp && npx vitest run bridge/changesets-logic.test.mjs bridge/mcp-server.test.mjs bridge/changesets-store.test.mjs`.
**Commit:** `feat(bridge): MA-1 placement — create doors, windows, roofs, ceilings; Mark and Structural; outlines checked in words`.

### Task 2 — The host finder (C#, pure) and its checks

**Files:** `SentinelAddin/GhostBuilder/PlacementGeometry.cs` (new, §3.2), `tools/promote-check/Placement.cs` (new, partial
`Check`: `PlacementChecks()`, `SeedWalls()`), `tools/promote-check/promote-check.csproj`, `tools/promote-check/Check.cs`.

1. `PlacementGeometry.cs` exactly as §3.2 (the add-in's SDK glob compiles it; no csproj change there).
2. `promote-check.csproj`: `<Compile Include="..\..\SentinelAddin\GhostBuilder\PlacementGeometry.cs" />`; the header comment adds
   "and the MA-1 host finder with the B35 seed body".
3. `Check.cs` `Main` (`:25-34`): after `Matrix(m, m2);` call `PlacementChecks();`.
4. `Placement.cs` (header as `Classes.cs:1-5`: `#nullable disable`, `System.Text.Json`, `Sentinel.Coordination`, `Sentinel.GhostBuilder`):
   §3.2's table, with `string H(string level, double x, double y) { var i = PlacementGeometry.Host(walls, level, x, y, out var why); return i >= 0 ? walls[i].Label : why; }`.

**Commands:** `dotnet run --project tools/promote-check` (all old checks + the new pass); both add-in builds.
**Commit:** `feat(placement): the one wall under a point — PlacementGeometry.Host, refusals in words (pure, promote-check)`.

### Task 3 — DTO and executor

**Files:** `SentinelAddin/Coordination/ChangesetClient.cs`, `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`.

1. `PlaceDto` (after `:36`):
   ```csharp
   // create (MA-1): a door's or window's point on its host wall's location line (mm, z = its level), a window's sill, flips;
   // a roof's or ceiling's outline in plan [[x,y],…] (mm), a roof's base offset, a ceiling's height above its level.
   [JsonPropertyName("Location")] public double[] Location { get; set; }
   [JsonPropertyName("SillHeight")] public double? SillHeight { get; set; }
   [JsonPropertyName("FlipFacing")] public bool? FlipFacing { get; set; }
   [JsonPropertyName("FlipHand")] public bool? FlipHand { get; set; }
   [JsonPropertyName("Boundary")] public double[][] Boundary { get; set; }
   [JsonPropertyName("BaseOffset")] public double? BaseOffset { get; set; }
   [JsonPropertyName("Offset")] public double? Offset { get; set; }
   // any create but a level or grid (MA-1): its Mark (ALL_MODEL_MARK); a floor's Structural (FLOOR_PARAM_IS_STRUCTURAL).
   [JsonPropertyName("Mark")] public string Mark { get; set; }
   [JsonPropertyName("Structural")] public bool? Structural { get; set; }
   ```
   `PlaceDto` is only ever deserialized (the Promote bodies are anonymous objects), so no body the add-in files changes.
2. `ChangesetExecutor.cs` header (`:6-8`): add "MA-1: a create also places a door or window (hosted by the one wall its point
   lies on), a flat footprint roof or a ceiling; any create but a level or grid may carry a Mark, a floor Structural."
   `using Autodesk.Revit.DB.Structure;` (StructuralType).
3. Helpers, next to `ResolveFloorType` (`:71-77`):
   ```csharp
   /// MA-1: the one loaded type of a category a create names — by exact name, and by family for a door or window. None → load
   /// it (Sentinel loads no families and creates no types); more than one → a person decides. System family names are never
   /// compared (translated in non-English Revit): a roof or ceiling names its type only. RetypeTarget stays Promote's.
   private static ElementType CreateType(Document doc, BuiltInCategory bic, string kind, string familyName, string typeName)
   {
       if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
       var hits = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>()
           .Where(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)
                       && (familyName == null || t is FamilySymbol s && string.Equals(s.FamilyName, familyName, StringComparison.OrdinalIgnoreCase)))
           .ToList();
       var label = familyName == null ? typeName : familyName + " : " + typeName;
       if (hits.Count == 0) throw new InvalidOperationException($"{kind} type \"{label}\" does not exist in this model — load it (Sentinel loads no families and creates no types), or re-propose with the exact name of a loaded type");
       if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} {kind} types are named \"{label}\" in this model — a person decides");
       return hits[0];
   }

   /// MA-1: a roof's or ceiling's outline (mm; the bridge checked it is one simple loop) as lines at zFt; a closing point equal
   /// to the first is dropped, as the bridge's outlineProblem reads it.
   private static List<Curve> Outline(double[][] b, double zFt, string what)
   {
       var n = b?.Length ?? 0;
       if (n > 3 && b[0][0] == b[n - 1][0] && b[0][1] == b[n - 1][1]) n--;
       if (n < 3) throw new InvalidOperationException($"{what}: its Boundary needs at least 3 points");
       XYZ P(int i) => new XYZ(b[i][0] * MmToFeet, b[i][1] * MmToFeet, zFt);
       return Enumerable.Range(0, n).Select(i => (Curve)Line.CreateBound(P(i), P((i + 1) % n))).ToList();
   }

   /// MA-1: a create's Mark (ALL_MODEL_MARK), when it carries one (the bridge refuses one on a level or grid).
   private static void SetMark(Element e, ChangesetElementDto el)
   {
       if (!string.IsNullOrWhiteSpace(el.Place?.Mark)) Set(e, BuiltInParameter.ALL_MODEL_MARK, el.Place.Mark, el.Kind);
   }
   ```
4. `Set` (`:181-192`): the `double` overload gains `string kind = "wall"` and says `on {kind} {e.UniqueId}` (attach's calls and
   words are unchanged); add the same for `int` and `string` values (kind required). The `ElementId` overload stays.
5. Wall loop (`:237-238`): `SetMark(wall, el);` before `Collect`. Floor loop (`:264`): before `Collect`,
   `if (el.Place.Structural is bool st) Set(floor, BuiltInParameter.FLOOR_PARAM_IS_STRUCTURAL, st ? 1 : 0, "floor"); SetMark(floor, el);`.
6. After the floor loop (`:265`), before the retype comment (`:267`):
   ```csharp
   // MA-1: a flat roof on its level — NewFootPrintRoof, and no footprint edge defines a slope (slopes are a later field).
   foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "roof"))
   {
       var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
       var level = ResolveLevel(doc, el.Place);
       var rt = CreateType(doc, BuiltInCategory.OST_Roofs, "roof", null, el.Place.TypeName) as RoofType
                ?? throw new InvalidOperationException($"roof \"{name}\": \"{el.Place.TypeName}\" is not a roof type Sentinel can sketch");
       var arr = new CurveArray();
       foreach (var c in Outline(el.Place.Boundary, level.Elevation, $"roof \"{name}\"")) arr.Append(c);
       var roof = doc.Create.NewFootPrintRoof(arr, level, rt, out ModelCurveArray edges);
       foreach (ModelCurve mc in edges) roof.set_DefinesSlope(mc, false);
       if (el.Place.BaseOffset is double off) Set(roof, BuiltInParameter.ROOF_LEVEL_OFFSET_PARAM, off * MmToFeet, "roof");
       SetMark(roof, el);
       Collect(result, el, roof);
   }

   // MA-1: a ceiling at its height above the level (place.Offset, required by the bridge).
   foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "ceiling"))
   {
   #if REVIT2022_OR_GREATER
       var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
       var level = ResolveLevel(doc, el.Place);
       var ct = CreateType(doc, BuiltInCategory.OST_Ceilings, "ceiling", null, el.Place.TypeName);
       var off = el.Place.Offset ?? throw new InvalidOperationException($"ceiling \"{name}\" has no Offset (its height above {level.Name})");
       var loop = CurveLoop.Create(Outline(el.Place.Boundary, level.Elevation, $"ceiling \"{name}\""));
       var ceiling = Ceiling.Create(doc, new List<CurveLoop> { loop }, ct.Id, level.Id);
       Set(ceiling, BuiltInParameter.CEILING_HEIGHTABOVELEVEL_PARAM, off * MmToFeet, "ceiling");
       SetMark(ceiling, el);
       Collect(result, el, ceiling);
   #else
       throw new InvalidOperationException("a ceiling create needs Revit 2022 or later — this Revit has no ceiling API");
   #endif
   }

   // MA-1: doors and windows after every wall of this changeset (Regenerate first), so one may host on a wall it creates. The
   // host is the ONE straight basic wall on the named level under the point (PlacementGeometry.Host) — none or two is a
   // refusal in words, never a guess. The symbol must be loaded; it is activated inside this transaction (Undo deactivates it).
   var openings = toPlace.Where(e => IsCreate(e) && e.Kind is "door" or "window").ToList();
   if (openings.Count > 0)
   {
       doc.Regenerate();
       var hosts = new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>()
           .Where(w => w.WallType.Kind == WallKind.Basic && !w.IsStackedWallMember && (w.Location as LocationCurve)?.Curve is Line).ToList();
       var lines = hosts.Select(w =>
       {
           var c = ((LocationCurve)w.Location).Curve;
           XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
           return ("wall " + w.Id.IdValue(), (doc.GetElement(w.LevelId) as Level)?.Name, a.X / MmToFeet, a.Y / MmToFeet, b.X / MmToFeet, b.Y / MmToFeet);
       }).ToList();
       foreach (var el in openings)
       {
           var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
           var level = ResolveLevel(doc, el.Place);
           var p = el.Place.Location ?? throw new InvalidOperationException($"{el.Kind} \"{name}\" has no Location");
           if (Math.Abs(p[2] * MmToFeet - level.Elevation) > TolFt)
               throw new InvalidOperationException($"{el.Kind} \"{name}\": Location z {Mm(p[2])} mm is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — a {el.Kind} stands on its level" + (el.Kind == "window" ? "; its sill is place.SillHeight" : ""));
           var sym = (FamilySymbol)CreateType(doc, el.Kind == "door" ? BuiltInCategory.OST_Doors : BuiltInCategory.OST_Windows,
                                              el.Kind, el.Place.FamilyName, el.Place.TypeName);
           var i = PlacementGeometry.Host(lines, level.Name, p[0], p[1], out var why);
           if (i < 0) throw new InvalidOperationException($"{el.Kind} \"{name}\": {why}");
           if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
           var fi = doc.Create.NewFamilyInstance(Pt(p), sym, hosts[i], level, StructuralType.NonStructural);
           if (el.Place.SillHeight is double sill) Set(fi, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM, sill * MmToFeet, el.Kind);
           if (el.Place.FlipFacing == true && !(fi.CanFlipFacing && fi.flipFacing())) throw new InvalidOperationException($"{el.Kind} \"{name}\" cannot flip its facing");
           if (el.Place.FlipHand == true && !(fi.CanFlipHand && fi.flipHand())) throw new InvalidOperationException($"{el.Kind} \"{name}\" cannot flip its hand");
           SetMark(fi, el);
           Collect(result, el, fi);
       }
   }
   ```
   `CreateType` with a family name only returns a `FamilySymbol`, so the cast is safe. `IdValue()` is `Compat.cs:12` (namespace `Sentinel`).
7. Nothing else moves: the retype and attach loops, the count guard, the stamp, the commit check.

**Revit API to verify while writing (both builds must compile; read the Nice3point reference assemblies, never guess):**
`Autodesk.Revit.Creation.Document.NewFamilyInstance(XYZ, FamilySymbol, Element host, Level, StructuralType)`;
`FamilySymbol.IsActive` / `Activate()` (the retype path already uses them, `:280`); `NewFootPrintRoof(CurveArray, Level, RoofType,
out ModelCurveArray)` and `FootPrintRoof.set_DefinesSlope(ModelCurve, bool)`; `Ceiling.Create(Document, IList<CurveLoop>, ElementId,
ElementId)` (2022+, as `ElementPlacementFactory.cs:422`); `CurveLoop.Create(IList<Curve>)`; `FamilyInstance.CanFlipFacing/flipFacing()`,
`CanFlipHand/flipHand()`; parameters `INSTANCE_SILL_HEIGHT_PARAM`, `CEILING_HEIGHTABOVELEVEL_PARAM`, `ROOF_LEVEL_OFFSET_PARAM`,
`ALL_MODEL_MARK`, `FLOOR_PARAM_IS_STRUCTURAL`. Units only through `MmToFeet` / `Pt`. If a call is obsolete in 2026, say so in the
report; do not suppress the warning.

**Commands:** both builds (2024, 2026) with `-p:DeployToRevit=false`; `dotnet run --project tools/promote-check` (it compiles the DTO).
**Commit:** `feat(executor): MA-1 — create doors and windows on the one wall under their point, flat roofs, ceilings; Mark, Structural`.

### Task 4 — Review window labels

**Files:** `SentinelAddin/UI/ChangesetReviewWindow.cs`.

1. Header (`:2-7`): "MA-1: a create row names family : type, level and the numbers a reviewer checks."
2. `:123` keeps `var type = el.Place?.TypeName;` (the retype label uses it); drop `lvl`. `:128` → `_ => CreateLabel(el, name),`.
3. Add (with `using System.Globalization;`):
   ```csharp
   /// <summary>A create row (MA-1): kind and name, then family : type, level, and the numbers a reviewer checks. Rows of the
   /// four v1 kinds read exactly as before.</summary>
   private static string CreateLabel(ChangesetElementDto el, string name)
   {
       var p = el.Place;
       var parts = new List<string> { $"{el.Kind}: {name}" };
       if (p?.TypeName != null) parts.Add((p.FamilyName != null ? p.FamilyName + " : " : "") + p.TypeName);
       if (p?.LevelName != null) parts.Add(p.LevelName);
       if (p?.SillHeight is double s) parts.Add($"sill {Mm(s)} mm");
       if (p?.Offset is double o) parts.Add($"offset {Mm(o)} mm");
       if (p?.BaseOffset is double b) parts.Add($"base offset {Mm(b)} mm");
       if (p?.Structural == true) parts.Add("structural");
       if (p?.Mark != null && p.Mark != name) parts.Add("Mark " + p.Mark);
       return string.Join("  ·  ", parts);
   }

   private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
   ```
   Seed rows then read `door: MA1-D01  ·  M_Single-Flush : MA1 1000 x 2100mm  ·  GR-FFL`, `window: MA1-W01  ·  M_Fixed : MA1 600 x 1200mm  ·  GR-FFL  ·  sill 900 mm`,
   `ceiling: MA1-C01  ·  MA1 Ceiling - 50mm  ·  GR-FFL  ·  offset 2700 mm`, `floor: MA1-L2-F02  ·  Generic 300mm  ·  01-FFL  ·  structural`.
   `PreTick` is unchanged: a create is pre-ticked only when the IDS accepted it.

**Commands:** both builds.
**Commit:** `feat(review): MA-1 create rows name family, type, level, sill, offset, structural`.

### Task 5 — B35 seed generator (`--b35`), the fixture, parity

**Files:** `demo/promote-sample/make-concept.py`, `WebApp/bridge/fixtures/changeset-ops/b35-seed-body.json` (generated),
`WebApp/bridge/changesets-logic.test.mjs`, `tools/promote-check/Placement.cs`.

1. `make-concept.py` — after `SHEET` (`:58`):
   ```python
   # B35 whole seed (--b35, MA-1): every element of the plan's section 6.3 table, placed by ONE changeset, each with its Mark.
   # The floors are FLOORS above with these default types (MA1-L2-F02 structural); PLACED is the rest: roofs and ceilings an
   # outline x0, y0, x1, y1 in plan, doors and windows the point on their MA-0 host wall's location line (the wall in the comment).
   FLOOR_TYPES = {"floor": "Generic 300mm", "floor_l2": "Concrete 150mm", "floor_gap": "Concrete 250mm",
                  "floor_office": "BDS_INT_ARC_SCREED_90 mm"}
   STRUCTURAL = ("MA1-L2-F02",)
   PLACED = [
       ("MA1-R01", "roof", "roof", "Generic - 300mm", (0, 0, 12000, 12000)),
       ("MA1-R02", "roof", "roof", "Generic - 225mm", (12000, 0, 24000, 12000)),
       ("MA1-C01", "ceiling", "L1", "MA1 Ceiling - 50mm", (0, 0, 4000, 4500)),
       ("MA1-C02", "ceiling", "L1", "Generic", (4000, 0, 8000, 4500)),
       ("MA1-C03", "ceiling", "L1", "600mm x 600mm ACT System", (8000, 0, 12000, 4500)),
       ("MA1-D01", "door", "L1", "M_Single-Flush : MA1 1000 x 2100mm", (8000, 2250)),  # I02
       ("MA1-D02", "door", "L1", "M_Double-Flush : MA1 2000 x 2100mm", (8000, 9750)),  # I07
       ("MA1-D03", "door", "L1", "M_Single-Flush : MA1 1000 x 2100mm", (6000, 0)),  # E01
       ("MA1-D04", "door", "L1", "M_Single-Flush : 0915 x 2134mm", (12000, 2250)),  # I03
       ("MA1-D05", "door", "L1", "BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm", (16000, 2250)),  # I04
       ("MA1-D06", "door", "L2", "M_Single-Flush : MA1 1000 x 2100mm", (8000, 2250)),  # I02 of the second storey
       ("MA1-W01", "window", "L1", "M_Fixed : MA1 600 x 1200mm", (24000, 3000)),  # E03
       ("MA1-W02", "window", "L1", "M_Fixed : MA1 800 x 1200mm", (18000, 12000)),  # E05
       ("MA1-W03", "window", "L1", "M_Fixed : MA1 600 x 1300mm", (6000, 12000)),  # E06
   ]
   SEED_TYPES = sorted(set(FLOOR_TYPES.values()) | {row[3] for row in PLACED})
   CEILING_OFFSET = 2700
   SILL = 900
   IFC = {"roof": "IfcRoof", "ceiling": "IfcCovering", "door": "IfcDoor", "window": "IfcWindow"}
   ```
   After `concept()` (`:106`):
   ```python
   def placed(mark, kind, lvl, type_name, geo):
       """One PLACED row as a create: a roof or ceiling by its outline, a door or window by its point (z = its level)."""
       lname, z = lvl
       place = {"LevelName": lname}
       if kind in ("door", "window"):
           family, _, type_name = type_name.partition(" : ")
           place.update(FamilyName=family, TypeName=type_name, Location=[geo[0], geo[1], z])
           if kind == "window":
               place["SillHeight"] = SILL
       else:
           x0, y0, x1, y1 = geo
           place.update(TypeName=type_name, Boundary=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
           if kind == "ceiling":
               place["Offset"] = CEILING_OFFSET
       place["Mark"] = mark
       return {"kind": kind, "place": place, "validate": {"identity": {"Class": IFC[kind], "Name": mark}}}


   def b35(l1, l2, roof_level, types):
       """Drill B35's whole seed as ONE changeset. types: a section 6.3 default type name -> the name to use instead."""
       elements = []
       for name, tag, which, x0, y0, x1, y1 in FLOORS:
           e = floor(name, types.get(FLOOR_TYPES[which], FLOOR_TYPES[which]), l1 if tag == "L1" else l2, x0, y0, x1, y1)
           e["place"]["Mark"] = name
           if name in STRUCTURAL:
               e["place"]["Structural"] = True
           elements.append(e)
       levels = {"L1": l1, "L2": l2, "roof": (roof_level, None)}
       for mark, kind, tag, type_name, geo in PLACED:
           elements.append(placed(mark, kind, levels[tag], types.get(type_name, type_name), geo))
       return {"name": "MA1 B35 seed", "source": "concept", "elements": elements}
   ```
   `main()`: three arguments —
   `--b35` (`store_true`, "MA-1: drill B35's whole seed as ONE changeset (plan section 6.3) — 5 floors, 2 roofs, 3 ceilings, 6 doors, 3 windows, each with its Mark; implies --skip-walls"),
   `--roof-level` (default `None`, "--b35: the roofs' level (default \"MA0 Roof\")"),
   `--type` (`action="append"`, `default=[]`, `metavar="DEFAULT=NAME"`, "--b35: use NAME wherever the seed names the section 6.3 type DEFAULT (repeatable)").
   Checks, in this order, after `--l1/--l2` (`:135-136`): `(a.type or a.roof_level) and not a.b35` → `p.error("--type and --roof-level go with --b35")`;
   `:137` becomes `if not (a.skip_walls or a.b35) and not (a.ext and a.int_ and a.gap):`; `a.b35 and any(floors.values())` →
   `p.error("--b35 names its own floor types; change one with --type")`; each `--type` partitions at the first `=`; an unknown
   DEFAULT or an empty NAME → `p.error(f'--type "{t}": DEFAULT must be one of: ' + ", ".join(SEED_TYPES))`. Then
   `body = b35(a.l1, a.l2, a.roof_level or "MA0 Roof", types) if a.b35 else concept(…)` (the `concept(...)` call unchanged); the
   `with open` block unchanged; then, for `--b35` only:
   ```python
   if a.b35:
       kinds = [e["kind"] for e in body["elements"]]
       print(f"wrote {a.out}: " + " + ".join(f"{kinds.count(k)} {k}s" for k in ("floor", "roof", "ceiling", "door", "window"))
             + f" ({len(kinds)} elements)")
       return 0
   ```
   Docstring: a paragraph after the B35 floors one — "MA-1 (drill B35, one command): --b35 writes the whole seed of the plan's
   section 6.3 as ONE changeset: 5 floors (MA1-L2-F02 structural), 2 flat roofs, 3 ceilings at 2700, 6 doors and 3 windows on
   the MA-0 walls, each with its Mark. Every type must already be in the model (Sentinel loads no families and creates no
   types); a type named otherwise there is passed as --type DEFAULT=NAME." + the command line of §5.2.
2. The fixture: `python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --out WebApp/bridge/fixtures/changeset-ops/b35-seed-body.json`
   → prints `wrote …: 5 floors + 2 roofs + 3 ceilings + 6 doors + 3 windows (19 elements)`. Commit the file.
3. vitest, after the v1 parity block:
   ```js
   // MA-1: drill B35's seed as make-concept.py --b35 writes it; tools/promote-check reads the same file into the add-in's DTOs.
   describe("b35-seed-body parity fixture (MA-1 placement slice)", () => {
     const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/b35-seed-body.json", import.meta.url), "utf8"));
     it("passes validateChangeset and keeps every place field, every Mark, one Structural floor", () => {
       const v = validateChangeset(body);
       expect(v).toMatchObject({ name: "MA1 B35 seed", source: "concept" });
       v.elements.forEach((el, i) => { expect(el.kind).toBe(body.elements[i].kind); expect(el.op).toBe("create"); expect(el.place).toEqual(body.elements[i].place); });
       const n = {}; for (const e of v.elements) n[e.kind] = (n[e.kind] ?? 0) + 1;
       expect(n).toEqual({ floor: 5, roof: 2, ceiling: 3, door: 6, window: 3 });
       expect(v.elements.every((e) => e.place.Mark === e.validate.identity.Name)).toBe(true);
       expect(v.elements.filter((e) => e.place.Structural).map((e) => e.place.Mark)).toEqual(["MA1-L2-F02"]);
     });
   });
   ```
4. promote-check, at the end of `PlacementChecks()`:
   ```csharp
   Console.WriteLine("\nMA-1 seed (WebApp/bridge/fixtures/changeset-ops/b35-seed-body.json, make-concept.py --b35)");
   var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "b35-seed-body.json");
   var els = (File.Exists(path) ? JsonSerializer.Deserialize<ChangesetDto>(File.ReadAllText(path)) : null)?.Elements ?? new List<ChangesetElementDto>();
   Ok(els.Count == 19 && string.Join(",", els.GroupBy(e => e.Kind).Select(g => g.Key + " " + g.Count())) == "floor 5,roof 2,ceiling 3,door 6,window 3",
      "19 elements: 5 floors, 2 roofs, 3 ceilings, 6 doors, 3 windows");
   Ok(els.All(e => e.Place?.Mark != null && e.Place.Mark == e.Validate?.Identity?.Name), "every element reads Place.Mark, equal to its name");
   Ok(els.Where(e => e.Place.Structural == true).Select(e => e.Place.Mark).SequenceEqual(new[] { "MA1-L2-F02" }), "Structural reads, on MA1-L2-F02 only");
   Ok(els.Where(e => e.Kind == "ceiling").All(e => e.Place.Offset == 2700 && e.Place.Boundary?.Length == 4 && e.Place.LevelName == "GR-FFL"),
      "ceilings read Boundary and Offset 2700 on GR-FFL");
   Ok(els.Where(e => e.Kind == "roof").All(e => e.Place.LevelName == "MA0 Roof" && e.Place.Boundary?.Length == 4 && e.Place.BaseOffset == null),
      "roofs read Boundary on MA0 Roof and no BaseOffset");
   Ok(els.Where(e => e.Kind == "window").All(e => e.Place.SillHeight == 900) && els.Where(e => e.Kind == "door").All(e => e.Place.SillHeight == null),
      "windows read SillHeight 900; doors carry none");
   var openings = els.Where(e => e.Kind is "door" or "window").ToList();
   Ok(openings.All(e => e.Place.FamilyName != null && e.Place.Location?.Length == 3 && e.Place.Location[2] == (e.Place.LevelName == "GR-FFL" ? 0 : 3300)),
      "doors and windows read FamilyName and Location, z = their level's elevation");
   var want = new Dictionary<string, string> { ["MA1-D01"] = "MA0-L1-I02", ["MA1-D02"] = "MA0-L1-I07", ["MA1-D03"] = "MA0-L1-E01",
       ["MA1-D04"] = "MA0-L1-I03", ["MA1-D05"] = "MA0-L1-I04", ["MA1-D06"] = "MA0-L2-I02", ["MA1-W01"] = "MA0-L1-E03",
       ["MA1-W02"] = "MA0-L1-E05", ["MA1-W03"] = "MA0-L1-E06" };
   Ok(openings.Count == 9 && openings.All(e => want.TryGetValue(e.Place.Mark, out var w) && H(e.Place.LevelName, e.Place.Location[0], e.Place.Location[1]) == w),
      "every seed door and window finds exactly its section 6.3 wall among the MA-0 seed's walls");
   ```

**Commands** (Bash; `S` = the scratchpad):
```
git show master:demo/promote-sample/make-concept.py > "$S/old.py"
run() { python "$1" "${@:2}" --out "$S/x.json" > "$S/$(basename "$1").txt"; }
run "$S/old.py" --l1 "L1:0" --l2 "L2:3000" --roof "R:6000" --ext a --int b --gap c; cp "$S/x.json" "$S/old.json"
run demo/promote-sample/make-concept.py --l1 "L1:0" --l2 "L2:3000" --roof "R:6000" --ext a --int b --gap c
cmp "$S/old.json" "$S/x.json" && cmp "$S/old.py.txt" "$S/make-concept.py.txt"          # MA-0: identical
#   the same pair with: --skip-walls --l1 "GR-FFL:0" --l2 "01-FFL:3300" --floor "Generic 300mm" --floor-l2 "Concrete 150mm" --floor-gap "Concrete 250mm" --floor-office "BDS_INT_ARC_SCREED_90 mm"
python "$S/old.py" --sheet > "$S/o.md"; python demo/promote-sample/make-concept.py --sheet > "$S/n.md"; cmp "$S/o.md" "$S/n.md"
python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --out "$S/b35.json" && cmp "$S/b35.json" WebApp/bridge/fixtures/changeset-ops/b35-seed-body.json
python demo/promote-sample/make-concept.py --l1 "GR-FFL:0" --l2 "01-FFL:3300" --type "a=b"                 # error: go with --b35
python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --type "Nope=x"       # error: lists SEED_TYPES
python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --floor "Generic 300mm" # error: --b35 names its own
python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --type "Generic 300mm=MA1 Floor - 300mm" --out "$S/r.json"  # F01 and L2-F02 renamed
cd WebApp && npx vitest run bridge/changesets-logic.test.mjs
dotnet run --project tools/promote-check
```
**Commit:** `feat(sim): B35 seed in one command — make-concept.py --b35 writes floors, roofs, ceilings, doors, windows with Marks (MA-1)`.

### Task 6 — Docs and graph

**Files:** `docs/superpowers/plans/2026-09-30-promote-v1-whole-elements.md`, `docs/strategy/2026-09-30-model-automation-design.md`, `docs/mcp-server.md`.

1. Promote v1 plan §6.1 step 5 (`:727-731`) and §6.2 (`:733-742`) → the texts in §5.1 and §5.2 below, verbatim. §6.3 (`:744`), a first line:
   "Placed by `make-concept.py --b35` (§6.2): roofs and ceilings are the outlines below, doors and windows the point on their host
   wall's location line at their centre (the script's `PLACED` table); every element's Mark is its id." §7 B35-10 (`:789`): append
   "(the placement facts — host, sill, flat roof, ceiling offset, Structural — are B35-0 in the MA-1 placement slice plan §5.3)".
   §9 (`:820`): after "new geometry (roof/ceiling/door/window **create** stays refused by the bridge)" add "— landed after v1 in the
   MA-1 placement slice (`2026-09-30-ma1-placement-slice.md`)".
2. Design doc, status lines only:
   - `:239` (row 4 Ghosts) "BUILT for 4 kinds, create only." → "BUILT: create for 8 kinds (wall, floor, level, grid; roof, ceiling,
     door, window since the MA-1 placement slice), retype for 6 (Promote v1), attach for walls (MA-0)."
   - `:241` (row 6 Place) "Per storey, level to level and hosted openings: MISSING." → "Hosted doors and windows (the one wall under
     the point, else refused), flat footprint roofs and ceilings, Mark and Structural: BUILT (MA-1 placement slice; live: B35-0).
     Per storey and level to level: MISSING."
   - `:1056` (GHB-1) append: "— its changeset half landed early (MA-1 placement slice, 2026-09-30: door, window, roof and ceiling
     creates; `Mark`, `Structural`); the DWG door-block reader and drill MA1b stay here."
3. `docs/mcp-server.md:21`: "(v1 vocabulary: wall, floor, level, grid)" → "(kinds: wall, floor, level, grid, roof, ceiling, door, window)".
4. `graphify update .`.

**Commit:** `docs: MA-1 placement slice — B35 set-up in one command, design status for placement`.

**Final checks before the merge:** both builds; `dotnet run --project tools/promote-check`; `cd WebApp && npm run test`; the Task 5
Python commands; `git diff master --stat` touches only the files named above.

---

## 5. Drill B35's set-up: what changes

| Step | Before (Promote v1 plan §6) | After this slice |
|---|---|---|
| Types | Load `M_Single-Flush`, `M_Double-Flush`, `M_Fixed`; 5 concept types + `MA1 Ceiling - 50mm` by hand | **Unchanged** — the only manual part (Sentinel loads no families and creates no types) |
| Floors | `--skip-walls --floor…` changeset | In the one changeset |
| Roofs, ceilings, doors, windows | Placed by hand from the `--sheet` table (14 elements at set positions) | In the one changeset |
| Marks, Structural | Set by hand on 19 elements; tick Structural on `MA1-L2-F02` | In the changeset |
| Review | Floors changeset only | One changeset, 19 rows, tick all, Apply — one Undo |
| Placement facts | Not checked | B35-0 (§5.3) |

### 5.1 New §6.1 step 5 (verbatim for the Promote v1 plan)

5. **The only hand-made part of the seed: types** (Sentinel loads no families and creates no types). Insert ▸ Load Family from
   the Revit 2024 content library `M_Single-Flush`, `M_Double-Flush`, `M_Fixed` (if the library is not installed, stop and ask:
   any non-BDS door/window family with type-level Width/Height will do, and its names go to §6.2 with `--type`). Duplicate types:
   `M_Single-Flush : MA1 1000 x 2100mm` (1000/2100), `M_Double-Flush : MA1 2000 x 2100mm`, `M_Fixed : MA1 600 x 1200mm`,
   `M_Fixed : MA1 800 x 1200mm`, `M_Fixed : MA1 600 x 1300mm`; ceiling `MA1 Ceiling - 50mm` (duplicate `600mm x 600mm ACT System`,
   Edit Structure to 50 mm total). Record which parameter Width sits in (Type Properties) — B35-10. Everything else the seed
   names is already in the copy: floor types `Generic 300mm`, `Concrete 150mm`, `Concrete 250mm`, `BDS_INT_ARC_SCREED_90 mm`; roof
   types `Generic - 300mm`, `Generic - 225mm`; ceiling types `Generic`, `600mm x 600mm ACT System`; `M_Single-Flush : 0915 x 2134mm`
   (comes with the family); `BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm` (the template). If two ceiling types are named
   `Generic` (Basic and Compound), rename the Compound one — Apply would otherwise refuse ("a person decides").

### 5.2 New §6.2 (verbatim for the Promote v1 plan)

### 6.2 The seed: one command, one changeset

```
python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --out ma1-seed.json
```
It writes the whole §6.3 seed as ONE changeset: 19 elements — 5 floors (`MA1-L2-F02` Structural), 2 flat roofs on `MA0 Roof`,
3 ceilings 2700 above GR-FFL, 6 doors and 3 windows (sill 900) on the MA-0 walls — each with its Mark. The type names default
to §6.3's; a type named otherwise in this copy (step 4) goes in as `--type "Generic 300mm=MA1 Floor - 300mm"` (repeatable), another
roof level as `--roof-level`. Post `ma1-seed.json` to `ma1-bds` (curl with the SIM base URL and bearer as in B8/B33, or
`sentinel_propose_changeset`), then run B35-0 (MA-1 placement slice plan §5.3): **Review AI Proposals**, tick every row, Apply —
one transaction, one Undo. Save `ma1-seed.rvt`, close. Every B35 attempt starts from a fresh copy `ma1-run.rvt`.
A declined Apply names the element and what to change (a type not loaded, a door point on no wall or on two, a level that does
not exist); nothing was placed — fix the copy or the arguments and post again. The two-step path (`--skip-walls --floor…` +
`--sheet`, the rest by hand) still works.

### 5.3 B35-0 — the placement slice, live (on `ma1-seed.rvt`, before saving; Revit 2024; record the build hash)

| Row | Do | Pass when |
|---|---|---|
| B35-0a Refusal, nothing placed | Before the seed: copy `ma1-seed.json` to `ma1-refusal.json`; change `MA1-D01`'s `Location` to `[8000, 0, 0.0]` and `name` to `MA1 refusal`; post; Review AI Proposals, tick all, Apply | Declined with `door "MA1-D01": 2 walls on GR-FFL pass within 1 mm of (8000, 0): wall …, wall … — a person decides the host`; no element added (floors, roofs, ceilings included); no new Undo entry |
| B35-0b Seed | Post `ma1-seed.json`; Review AI Proposals | 19 rows labelled as Task 4 (`door: MA1-D01 · M_Single-Flush : MA1 1000 x 2100mm · GR-FFL`, `window: … · sill 900 mm`, `ceiling: … · offset 2700 mm`, `floor: MA1-L2-F02 · … · structural`); tick all; Apply → "Applied 19 element(s)"; the Undo drop-down's top entry is `Sentinel AI changeset: MA1 B35 seed [xxxxxxxx]` (read it, do not undo); `GET /cde/ma1-bds/audit` has the `changeset_applied` row with 19 |
| B35-0c What landed | Read in the UI (never `send_code_to_revit`) | Mark = id on all 19; `MA1-L2-F02` Structural ticked (any Revit warning recorded); D01–D06 and W01–W03 hosted by their §6.3 walls and cutting them; W01–W03 Sill Height 900; C01–C03 Height Offset From Level 2700; R01/R02 on MA0 Roof, Base Offset 0, no edge defines slope (Edit Footprint); if the BDS glass door's symbol was inactive, it is active now (B35-10's `Activate()` fact); each door's facing as Revit chose it (recorded; the seed flips none) |

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| `NewFamilyInstance` reads the point's z differently from what P2 assumes (a window at sill 0) | z = the level's elevation, refused otherwise; the sill is set explicitly from `SillHeight` after creation; B35-0c reads W01–W03's sill |
| A window without `SillHeight` gets a sill nobody reviewed | It is the family's own default (not a Sentinel guess); the row shows no sill; B35 always sends 900 |
| Revit refuses a sketch the bridge passed (a near-degenerate outline, a door wider than its wall run) | The transaction fails, the changeset is declined with Revit's message, nothing placed (the executor's contract) |
| `Generic` names two ceiling types | "a person decides" refusal; §5.1 tells the founder to rename one |
| Structural on a floor posts warnings (analytical model) | Warnings do not roll back; B35-0c records them |
| Duplicate Marks | Revit warns only; not checked (a later bridge check if agents start colliding) |
| A door in a two-storey, stacked, curtain or arc wall | Refused in words (P1); widen with evidence |
| Two adjacent flat roofs share an edge | Allowed by Revit; B35-0c looks |
| `Level.Elevation` frame vs the project base point | The same frame the wall creates use today; B35's model has its base at 0 |
| 200 outlines of 256 points each | The bridge's O(n²) test is ~6.5M segment pairs (milliseconds); bodies stay far under the 16 MB JSON cap |

---

## 7. Out of scope (said, not built)

Sloped roofs and slope arrows; roof and ceiling openings (inner loops); curved edges and arc-wall hosts; a host by level range
(a wall based on another storey); rehosting (MA-5); the GHB-1 DWG door-block reader and drill MA1b; a "Tick all" button; a
duplicate-Mark check; `set_parameter` for other properties; any Promote change; one Undo per storey across changesets (MA-2).
