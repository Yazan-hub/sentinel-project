# Snowdon High Findings Implementation Plan (Datum single-drawing + LLM provenance)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two HIGH findings from the 2026-07-26 Snowdon external test (`docs/reviews/external-test-2026-07-26-snowdon.md`): (1) Datum silently pools grids across incompatible per-sheet origins; (2) confidently-wrong LLM layer mappings arrive pre-ticked in the Ghost review window.

**Architecture:** (1) Datum reuses the existing `DwgPickWindow` so the user picks ONE drawing per run (runs are idempotent — run once for the plan/grids, again for the section/levels). (2) `LayerMapping` gains a `Source` provenance field ("standard" | "llm"); the review window ticks by provenance, not confidence — LLM rows and absurd-count rows start unticked. AIA/NCS layer aliases + ignores are added to both shipped layer rulesets so the deterministic tier absorbs common real-world names before the LLM ever sees them.

**Tech Stack:** C# (net48 + net8.0-windows dual target), JSON config, existing check-project pattern (`tools/ghost-p2-check`).

## Global Constraints

- Compiles on BOTH net48 (Revit ≤2024) and net8.0-windows (2025/26): `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2024 -p:DeployToRevit=false` green after every task.
- Pure modules (`DatumFromDrawing.cs`, `LayerRulesetMatcher.cs`, `GhostReviewWindow.cs` as compiled by the check tools) keep zero `Autodesk.Revit` usings where they have none today.
- `dotnet run --project tools/datum-check` and `dotnet run --project tools/ghost-p2-check` stay ALL PASS (extend, never weaken).
- `cd WebApp && npx vitest run` stays green (no TS changes expected; `layers.test.ts` uses an inline fixture, so ruleset JSON edits don't touch it).
- The tier-1 mapping cache (`%AppData%\Sentinel\dwg_mappings.json`) round-trips `LayerMapping` through JSON: a cached row with no `Source` field must be treated as `"llm"` (conservative), never `"standard"`.
- The `DwgPickWindow` reuse must not change the Ghost Builder flow's behaviour or text.

---

### Task 1: DwgPickWindow — configurable title and header

The window's title ("Ghost Builder: choose a drawing") and header ("…imported origin-to-origin and **kept in the model**") are hardcoded and wrong for Datum, which rolls its imports back.

**Files:**
- Modify: `SentinelAddin/UI/DwgPickWindow.cs` (ctor ~L17, title ~L19, header ~L46-50)
- Modify: `SentinelAddin/Commands.GhostBuilder.cs` (~L87 — the only existing caller; keep its text identical)

**Interfaces:**
- Produces: `DwgPickWindow(IReadOnlyList<string> files, IReadOnlyCollection<string>? alreadyImportedNames = null, string? title = null, string? header = null)` — null keeps today's Ghost text, so the existing caller compiles unchanged even without edits (but pass explicit text there anyway for clarity if the diff stays small).

- [ ] **Step 1: Add the two optional ctor params**

In the ctor, replace the hardcoded strings:

```csharp
public DwgPickWindow(IReadOnlyList<string> files,
                     IReadOnlyCollection<string>? alreadyImportedNames = null,
                     string? title = null, string? header = null)
{
    Title = title ?? "Sentinel — Ghost Builder: choose a drawing";
    ...
    // where the header TextBlock is built (~L46-50):
    Text = header ?? "Drawings found in the project's Ghost source folder. " +
                     "The chosen one is imported origin-to-origin and kept in the model.",
```

(Adapt to the file's actual code-built-WPF structure; only the two strings move.)

- [ ] **Step 2: Build both targets**

```bash
dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026 -p:DeployToRevit=false
dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false
```
Expected: 0 errors both. Also `dotnet run --project tools/ghost-p2-check` (it compiles this window) — ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add SentinelAddin/UI/DwgPickWindow.cs SentinelAddin/Commands.GhostBuilder.cs
git commit -m "refactor(ui): DwgPickWindow title/header configurable - Datum can reuse it without the 'kept in the model' lie"
```

---

### Task 2: Datum reads ONE user-chosen drawing

`Commands.Datum.cs:46` calls `builder.DetectFromFolder(folder)` which pools every DWG's segments into two flat lists (`DatumBuilder.cs:58-109`) — the root cause of the misaligned 35-grid result. Replace the folder pool with a single-file pick; the folder overload stays for API compatibility but the command no longer uses it.

**Files:**
- Modify: `SentinelAddin/GhostBuilder/DatumBuilder.cs` (add `DetectFromFiles`; make `DetectFromFolder` delegate)
- Modify: `SentinelAddin/Commands.Datum.cs` (~L32-66)
- NOT modified: `SentinelAddin/GhostBuilder/DatumFromDrawing.cs`, `tools/datum-check` (signatures untouched — the pure layer never knew about files)

**Interfaces:**
- Consumes: `DwgPickWindow(files, null, title, header)` from Task 1; `SettingsManager.Resolve(doc).GhostSourceFolder` (existing).
- Produces: `public Detected DetectFromFiles(IReadOnlyList<string> files, string levelLayerKeyword = "LEVEL", string gridLayerKeyword = "GRID")` — same return type as `DetectFromFolder`, same scratch-import/rollback structure, but only the given files.

- [ ] **Step 1: Refactor DatumBuilder**

Extract the body of `DetectFromFolder` (the transaction + scratch view + import loop + `Compute`) into:

```csharp
public Detected DetectFromFiles(IReadOnlyList<string> files,
                                string levelLayerKeyword = "LEVEL",
                                string gridLayerKeyword = "GRID")
{
    // identical body to today's DetectFromFolder from the transaction down,
    // iterating `files` instead of the Directory.EnumerateFiles result
}

public Detected DetectFromFolder(string folder,
                                 string levelLayerKeyword = "LEVEL",
                                 string gridLayerKeyword = "GRID")
{
    var files = Directory.EnumerateFiles(folder, "*.*")
        .Where(f => f.EndsWith(".dwg", StringComparison.OrdinalIgnoreCase)
                 || f.EndsWith(".dxf", StringComparison.OrdinalIgnoreCase))
        .OrderBy(f => f).ToList();
    return DetectFromFiles(files, levelLayerKeyword, gridLayerKeyword);
}
```

Keep the rollback `finally`, the `Placement = Origin` options, and the "Datum read from: …" warning exactly as they are (the warning now names one file).

- [ ] **Step 2: The command picks one drawing**

In `Commands.Datum.cs`, replace the `DetectFromFolder` call (~L46):

```csharp
Detected detected;
if (haveFolder)
{
    var files = Directory.EnumerateFiles(folder, "*.*")
        .Where(f => f.EndsWith(".dwg", StringComparison.OrdinalIgnoreCase)
                 || f.EndsWith(".dxf", StringComparison.OrdinalIgnoreCase))
        .OrderBy(f => f).ToList();
    if (files.Count == 0) { /* existing no-files path */ }

    var pick = new DwgPickWindow(files, null,
        title:  "Sentinel — Datum: choose ONE drawing",
        header: "Pick the drawing to read datum from. Levels come from a section's " +
                "LEVEL layer, grids from a plan's GRID layer. The drawing is read " +
                "temporarily (nothing is kept). Sheets have different origins - " +
                "run once per drawing; existing levels/grids are kept, not duplicated.");
    new System.Windows.Interop.WindowInteropHelper(pick) { Owner = c.Application.MainWindowHandle };
    if (pick.ShowDialog() != true || pick.SelectedPath == null)
        return Result.Cancelled;

    detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
}
else detected = builder.Detect();  // existing pick-from-model path unchanged
```

(Match the file's real structure — `PickFromModel` on this window should be hidden or ignored for Datum: check how the button is exposed; if hiding needs a third ctor flag, add `bool showPickFromModel = true` in Task 1 instead of hacking here.)

- [ ] **Step 3: Verify**

Both builds green; `dotnet run --project tools/datum-check` ALL PASS (nothing it compiles changed);
`dotnet run --project tools/ghost-p2-check` ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/GhostBuilder/DatumBuilder.cs SentinelAddin/Commands.Datum.cs SentinelAddin/UI/DwgPickWindow.cs
git commit -m "fix(datum): read datum from ONE picked drawing - pooling per-sheet origins produced misaligned grids (Snowdon finding 1)"
```

---

### Task 3: LayerMapping provenance (`Source`)

`LayerMapping` (`GhostBuilder_Architecture.cs:19-29`) has no record of which tier produced it; an LLM row at 0.9 is indistinguishable from an alias hit at 0.95. Add `Source`, set it in `LayerMapper`, and treat cache rows without it as LLM.

**Files:**
- Modify: `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs` (~L19-29)
- Modify: `SentinelAddin/GhostBuilder/LayerMapper.cs` (tiers at ~L64-122, `WithLayer` ~L163-176, cache load ~L55-57)

**Interfaces:**
- Produces: `LayerMapping.Source` — `string`, values `"standard"` (ruleset exact/alias/format/keyword) or `"llm"`. JSON-serialized (so the cache round-trips it). Consumed by Task 4's tick logic.

- [ ] **Step 1: Add the property**

```csharp
/// <summary>Which tier produced this mapping: "standard" (deterministic ruleset) or "llm".
/// Cached rows from before this field exist deserialize as null - treat null as "llm".</summary>
public string Source { get; set; } = "llm";
```

(Default `"llm"` is the conservative fail-safe: anything that didn't explicitly come from the matcher is untrusted.)

- [ ] **Step 2: Set it at both tiers in LayerMapper**

- Tier-2 deterministic (`:94` area): after `_matcher.Match(layer)` produces a mapping, set `Source = "standard"`.
- Tier-3 LLM rows (`:110-117`): set `Source = "llm"` explicitly.
- `WithLayer` copy-constructor: carry `Source` through.
- Cache purge/load (`:55-57`): no change needed — a cached row's serialized `Source` flows back; pre-existing cache files simply deserialize `Source = null` → but the property default only applies when the JSON lacks the key AND the deserializer honours defaults. Verify with the actual serializer used (System.Text.Json: missing key keeps the property initializer → `"llm"`. Confirm; if the mapper constructs via object-initializer from parsed JSON instead, handle null → `"llm"` at the read site).

- [ ] **Step 3: Verify + commit**

Both builds green; `ghost-p2-check` ALL PASS.

```bash
git add SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs SentinelAddin/GhostBuilder/LayerMapper.cs
git commit -m "feat(ghost): LayerMapping.Source provenance - standard vs llm, cache-safe with conservative default"
```

---

### Task 4: Review window ticks by provenance + absurd-count guard

`GhostReviewWindow.cs:139` ticks `n > 0 && m.Confidence >= 0.5`. Snowdon showed confident nonsense at 0.7-0.9. New rule: only deterministic rows start ticked, and an absurd element count unticks + flags any row.

**Files:**
- Modify: `SentinelAddin/UI/GhostReviewWindow.cs` (~L113, L136-148, L203-204)

**Interfaces:**
- Consumes: `LayerMapping.Source` (Task 3), the per-row count `n` (already at `:136`).
- Produces: tick rule `n > 0 && n <= HighCountFlag && m.Confidence >= preTickAbove && m.Source == "standard"`; visible " · LLM" suffix on LLM rows and " ⚠ high count — likely annotation" on flagged rows.

- [ ] **Step 1: Implement**

```csharp
// ponytail: fixed cap - one plan layer proposing >500 elements is annotation noise
// (Snowdon: 6,961 handrail segments as "floors"). Make configurable if a real
// layer ever legitimately exceeds it.
private const int HighCountFlag = 500;
```

At the row-build site (~L136-148):

```csharp
bool isStandard = string.Equals(m.Source, "standard", StringComparison.OrdinalIgnoreCase);
bool absurd = n > HighCountFlag;
cb.IsChecked = n > 0 && !absurd && isStandard && m.Confidence >= preTickAbove;
// label suffixes:
if (!isStandard) labelText += "  · LLM";
if (absurd) labelText += "  ⚠ high count — likely annotation";
```

Update the status line (~L203-204) to state the new rule: "Deterministic standard matches start ticked; LLM-proposed and high-count rows start unticked — review before building."

- [ ] **Step 2: Extend ghost-p2-check with a regression case**

Read `tools/ghost-p2-check/Check.cs` for its window-driving idiom. Add one case: build a mapping list containing (a) a `Source="standard"`, conf 1.0, n=10 row, (b) a `Source="llm"`, conf 0.9, n=10 row, (c) a `Source="standard"`, conf 1.0, n=10000 row; load the window; assert only (a) is ticked. If the window's checkbox state isn't reachable from the check (WPF), assert on whatever surface the check already uses (e.g. the BuildRequested payload after a programmatic accept) — the point is a runnable check that fails if the tick rule regresses. If genuinely untestable there, extract the tick predicate into a small pure static (`static bool PreTick(int n, double conf, string source, double preTickAbove)`) and assert on that.

- [ ] **Step 3: Verify + commit**

Both builds green; `ghost-p2-check` ALL PASS including the new case.

```bash
git add SentinelAddin/UI/GhostReviewWindow.cs tools/ghost-p2-check/Check.cs
git commit -m "fix(ghost): review window ticks by provenance not confidence; absurd-count rows flagged and unticked (Snowdon finding 2)"
```

---

### Task 5: AIA/NCS layer knowledge in the shipped rulesets

The deterministic tier should absorb the common US National CAD Standard names so the LLM sees far fewer unknowns. Data-only task.

**Files:**
- Modify: `SentinelAddin/Resources/bds-layers.json`
- Modify: `config/base-standard/layers.json`

**Interfaces:** consumed by `LayerRulesetMatcher` (aliases exact-normalized, 0.95 conf; `ignore[]` globs `^…$` with `*` wildcards, applied at tier 0 before the LLM). Note the hardcoded `BuiltInIgnoreTokens` substring net (`LayerRulesetMatcher.cs:168-173`) already drops ANNO/TEXT/DIM/TAG/GRID/HATCH-containing names — do not duplicate those.

- [ ] **Step 1: Add to BOTH files' `ignore[]`** (globs; skip any already covered by the built-in tokens):

```json
"*-IDEN", "*-PATT", "*-OVHD", "*-HRAL", "*-OTLN-*", "*-LEVL",
"A-VRTC*", "Q-SPCQ*", "L-PLNT*", "L-SITE*", "G-*", "SD-*", "*-TTLB*", "*-PLOT*"
```

Rationale, one line each in a `_note`: IDEN=tags, PATT=hatching, OVHD=overhead dashed, HRAL=handrails (real geometry but not LOD-200 primary), LEVL=level annotation, VRTC=vertical-circulation symbols, SPCQ=space/area queries, L-*=landscape, G-/SD-=general/site-detail sheets, TTLB/PLOT=title block.

- [ ] **Step 2: Add `aliases` on the existing layer entries** (both files; exact-normalized match — list the *full* real names):

- wall entry: `"A-WALL-EXT"`, `"A-WALL-INT"`, `"A-WALL-FULL"`, `"A-WALL-PRHT"`
- door entry: `"A-DOOR-FRAM"`
- column/structure entry: `"S-COLS"`, `"S-COLS-CONC"`, `"S-COLS-STL"`
- floor entry: `"A-FLOR-OTLN"`
- glazing/window entry (create if absent in base pack, matching schema): `"A-GLAZ"`, `"A-GLAZ-FULL"`, `"A-WIND"`

Keep every existing entry/alias untouched. Validate both files parse: `python -c "import json;json.load(open('SentinelAddin/Resources/bds-layers.json'));json.load(open('config/base-standard/layers.json'))"`.

- [ ] **Step 3: Verify nothing regressed**

`cd WebApp && npx vitest run` (layers.test.ts uses an inline fixture — must stay green); `dotnet run --project tools/ghost-p2-check` ALL PASS; both add-in builds green (Resources are content files — confirm the csproj copies them).

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/Resources/bds-layers.json config/base-standard/layers.json
git commit -m "feat(layers): AIA/NCS aliases + ignore globs in both shipped rulesets - deterministic tier absorbs real-world names before the LLM"
```

---

### Task 6: Live re-run on Snowdon (human + Claude)

- [ ] Deploy build to Revit 2024 (Revit closed → `dotnet build -p:RevitVersion=2024`), reopen, fresh project.
- [ ] Datum → pick window appears with the Datum-specific header → choose `A101.dwg` → expect a coherent single-origin grid set (no misaligned cluster). Run again on a section sheet (`A3xx`) → levels or the honest zero-diagnostic.
- [ ] Ghost Builder → `A101.dwg` → review window: deterministic rows (A-WALL/A-COLS/A-FLOR + new aliases) ticked; LLM rows carry " · LLM" and start unticked; `A-FLOR-HRAL` either ignored outright (tier 0) or flagged "high count"; layer count sent to the LLM visibly smaller than 32.
- [ ] Update `docs/reviews/external-test-2026-07-26-snowdon.md` findings 1-2 with a "Fixed — verified <date>" line each; update the chain row note in `docs/handbook/05-capability-status.md` if the re-run changes its caveats. Commit + push.
