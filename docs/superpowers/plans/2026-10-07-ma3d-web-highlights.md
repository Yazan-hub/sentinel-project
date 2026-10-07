# MA-3d (slice 1) — web highlights: each Promote ghost carries its element's IFC GlobalId, and the review desk highlights a storey's ghosts in the loaded 3D model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3a plan's "Next ▸ MA-3d — web highlights and the proposal model" (`docs/superpowers/plans/2026-10-04-ma3a-binding-web-decline.md:2434`), its first half as one slice: a Promote ghost that changes an element that exists (a retype, an attach, a type edit) carries that element's **IFC GlobalId** (`target.ifc_guid`, sent by the add-in, kept by the bridge, shown nowhere new), and the web **review desk** gains, per storey, **Highlight in 3D**: the storey's ghosts are highlighted in whichever models the viewer has loaded, by GlobalId, with words that say how many were found, in which loaded model versions, and that a ghost not found may be newer than the loaded version ("Revit may be newer"); **Clear** removes the highlight. The second half — a proposal model of the creates (`proposal.frag` through `ifc-writer.ts`) — waits for its one-hour spike (does a bridge-made `.frag` load and colour as its own model in the viewer's fragments version) and is this plan's Next.

**Architecture:**
- Add-in: `WallFact` and `ElementFact` gain `IfcGuid` (computed where the facts are read, on the API thread: `BcfApplyEvent.ToIfcGuid(ExportUtils.GetExportId(doc, e.Id))`, null when it throws); `PromoteGhost` gains `IfcGuid`, copied at every ghost construction; the bodies' `target` gains `ifc_guid` (null is left out by `WriteJson`). Promote only — Ghost Builder's creates have no element yet.
- Bridge: `validateChangeset` accepts an optional `target.ifc_guid` on a retype, attach or set_parameter (22 characters of the IFC base64 alphabet), keeps it on `target`, refuses a malformed one in words; `carryKey` unchanged (the key is the element's UniqueId and the change).
- Web: `Ghost.target.ifc_guid?`; `reviewDeskPanel(opts: { baseUrl?, components? })` — `main.ts` hands it `components`; a pure `highlightPlan(ghosts, found)` decides the map and the words; the storey's **Highlight in 3D** button resolves the GUIDs in every loaded model (`model.getLocalIdsByGuids`, `@thatopen/fragments` 3.4.7), highlights through `OBF.Highlighter` (`highlightByID("select", map, true, true)` — the clash panel's call), and says the words; **Clear** calls `highlighter.clear("select")`.

**Tech Stack:** C# add-in (net48/net8/net10), Node bridge (vitest), TypeScript web on That Open (`@thatopen/components`, `@thatopen/components-front`, `@thatopen/fragments` 3.4.7), `tools/promote-check`.

**Base:** `feature/ma3d-web-highlights` at master `71db9d9`. Repo root `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`. Every file:line below was read at `71db9d9`.

## Global Constraints

- House style: words are sentences; comments name the slice ("MA-3d") and the reason; exact words pinned. No new dependency. No migration. The web app's version bump (1.0.54) is the controller's at the merge, not a task's.
- Commit messages `feat(revit|bridge|web): MA-3d - …` with a blank line and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit only on `feature/ma3d-web-highlights`.
- Add-in builds carry `-p:DeployToRevit=false` (2024 at least; the final checks build 2022/2024/2026/2027): 0 errors. `dotnet run --project tools/promote-check 2>&1 | tail -2` → `N/N checks pass` (master: 854).
- Bridge/web tests: `npx vitest run <files>` from `WebApp`; never a bare `node bridge/bcf-service.mjs`. The full suite is the final checks' (`WebApp/bridge/fixtures/lod-matrix/ids-cases.json` may show as modified after it — line endings; restore it with `git checkout -- …`).
- The web builds with vite (`npm run build` from `WebApp`): the final checks run it; `tsc` is not a gate (17 pre-existing lib-target errors; no new one).
- Never print a token or an e-mail. Never run Revit.

---

### Task 1 — Add-in: every Promote ghost carries its element's IFC GlobalId

**Files:** modify `SentinelAddin/Commands.PromoteWalls.cs` (`Fact(Document doc, Wall w)` `:439-470`, `OtherFact(Document doc, Element e, string kind)` `:492-520`), `SentinelAddin/GhostBuilder/PromotePlanner.cs` (`ElementFact` `:22-34`; the ghost constructions at `:338` and `:417`), `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` (`WallFact` `:25-45`; `PromoteGhost` `:53-60`; the attach ghost at `:296`; `Element(g)` `:381-389` and `SetParameter(g)` `:394-399`), `SentinelAddin/GhostBuilder/PropertyPlanner.cs` (the set_parameter ghost at `:420`); test `tools/promote-check/Ma3d.cs` (new; `Check.cs` calls `Ma3dChecks();` after `Ma3cChecks();`).

- [ ] **Step 1:** `WallFact` and `ElementFact` gain `public string IfcGuid;` with the doc comment `/// <summary>MA-3d: the element's IFC GlobalId (ExportUtils.GetExportId, as the IFC export and the BCF viewpoints name it); null when Revit gave none.</summary>`. In `Fact` and `OtherFact`, set it: `IfcGuid = IfcGuidOf(doc, w)` / `IfcGuidOf(doc, e)` with one private helper in `Commands.PromoteWalls.cs`:
```csharp
    /// <summary>MA-3d: the element's IFC GlobalId as the IFC export writes it (and as a published .frag carries it), or null — the web
    /// desk highlights a ghost's element in the loaded model by it. On the API thread (ExportUtils reads the model).</summary>
    private static string IfcGuidOf(Document doc, Element e)
    {
        try { return BcfApplyEvent.ToIfcGuid(ExportUtils.GetExportId(doc, e.Id)); } catch (Exception) { return null; }
    }
```
(`BcfApplyEvent.ToIfcGuid` is `internal static` in `Coordination/BcfApplyEvent.cs:207`; `using Autodesk.Revit.DB.IFC;` for `ExportUtils` if the file lacks it.)
- [ ] **Step 2:** `PromoteGhost` gains `public string IfcGuid;` (comment: `/// <summary>MA-3d: the target element's IFC GlobalId, from its fact; null when none.</summary>`). Every construction copies it: `:338` and `:417` in `PromotePlanner.cs` add `IfcGuid = e.IfcGuid,`; `:296` in `PromoteWallsPlanner.cs` adds `IfcGuid = w.IfcGuid,`; `PropertyPlanner.cs:420` adds `IfcGuid = <the fact's IfcGuid>` (read the surrounding code for the fact variable's name). `Element(g)`'s target becomes `target = new { unique_id = g.UniqueId, type_before = g.TypeBefore, ifc_guid = g.IfcGuid },` and `SetParameter(g)`'s `target = new { unique_id = g.UniqueId, ifc_guid = g.IfcGuid },` (null is dropped by `WriteJson`'s `WhenWritingNull`).
- [ ] **Step 3: pins** — `tools/promote-check/Ma3d.cs`, `static void Ma3dChecks()`, heading `"\nMA-3d — a Promote ghost carries its element's IFC GlobalId"`: (a) `PromoteWallsPlanner.Element(...)`/`SetParameter(...)` are private — pin through the public `Bodies(...)` as `Filing.cs`/`Ma2cWiring.cs` do (read one of them for the pattern): a plan with one retype ghost whose `IfcGuid = "2O2Fr$t4X7Zf8NOew3FLKI"` → the body's first element's `target.ifc_guid` is that string (serialize with `JsonSerializer.Serialize(body, ChangesetClient.WriteJson)` and read it back as `JsonNode`); a ghost with `IfcGuid = null` → the serialized target has no `ifc_guid` key. (b) wiring: `Src("Commands.PromoteWalls.cs")` contains `private static string IfcGuidOf(Document doc, Element e)` and `IfcGuid = IfcGuidOf(doc, w)` and `IfcGuid = IfcGuidOf(doc, e)`; `Src("GhostBuilder", "PromotePlanner.cs")` has `Count(…, "IfcGuid = e.IfcGuid") == 2`; `Src("GhostBuilder", "PromoteWallsPlanner.cs")` contains `IfcGuid = w.IfcGuid` and `ifc_guid = g.IfcGuid` twice. Existing pins that quote `target = new { unique_id = g.UniqueId, type_before = g.TypeBefore }` or `target = new { unique_id = g.UniqueId }` by exact text (grep `tools/promote-check` for `unique_id = g.UniqueId`) are updated to the new lines — list each in the report.
- [ ] **Step 4:** build 2024 (`-p:DeployToRevit=false`, 0 errors); `dotnet run --project tools/promote-check 2>&1 | tail -2`.
- [ ] **Step 5: commit** — `feat(revit): MA-3d - every Promote ghost carries its element's IFC GlobalId (target.ifc_guid, from ExportUtils as the IFC export names it) so the web desk can highlight it in the loaded model; promote-check 56`

### Task 2 — Bridge: `target.ifc_guid` accepted, kept and checked

**Files:** modify `WebApp/bridge/changesets-logic.mjs` (`:32` regexes; `:346-373` the non-create target block); test `WebApp/bridge/changesets-logic.test.mjs` (the `validateChangeset — shape` describe at `:34`; the pin at `:531` that expects `target` to equal `{ unique_id, type_before }` exactly — keep it true for a body with no `ifc_guid`).

- [ ] **Step 1:** beside `UNIQUE_ID` add `const IFC_GUID = /^[0-9A-Za-z_$]{22}$/; // MA-3d: an IFC GlobalId as the export writes it (22 characters of its base64 alphabet)`. In the non-create block, before `target = { unique_id: uid, type_before: before };`:
```js
      // MA-3d: the element's IFC GlobalId, when the add-in sends it — the web desk highlights the ghost's element in the loaded model by it.
      // Optional (a changeset filed by an older add-in has none); a malformed one is a 400 in words; it is kept as sent, never derived.
      const guid = el.target.ifc_guid ?? null;
      if (guid !== null && (typeof guid !== "string" || !IFC_GUID.test(guid))) throw err(400, `${at}: target.ifc_guid must be an IFC GlobalId — 22 characters of its alphabet — when it is sent`);
```
and `target = { unique_id: uid, type_before: before, ...(guid ? { ifc_guid: guid } : {}) };`.
- [ ] **Step 2: tests** in `changesets-logic.test.mjs` (a new `it` in the shape describe): a retype with `target.ifc_guid: "2O2Fr$t4X7Zf8NOew3FLKI"` keeps it on `elements[0].target`; a set_parameter keeps it too; one without the field has no `ifc_guid` key (the `:531` pin unchanged); `"abc"` and `123` → `{ status: 400 }` with the exact words; `carryKey` of two elements differing only in `ifc_guid` is the same key.
  Run `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs`.
- [ ] **Step 3: commit** — `feat(bridge): MA-3d - a retype, attach or type edit may carry target.ifc_guid (an IFC GlobalId, 22 characters); kept as sent, refused in words when malformed, absent when not sent`

### Task 3 — Web: the desk's Highlight in 3D

**Files:** modify `WebApp/src/setups/review-desk.ts` (`Ghost` `:19-27`; `reviewDeskPanel` `:221-331`), `WebApp/src/main.ts:250` (pass `components`), test `WebApp/src/setups/review-desk.test.ts`. Read first: `WebApp/src/setups/clash-panel.ts:30-36` (components, `FragmentsManager`, `OBF.Highlighter`) and `:250-300` (`highlightByID`), `:302-316` (`fragments.list` → models, `model.modelId`), `WebApp/src/setups/files-panel.ts:86-91` (`modelIdOf = `${iso_name}@${revision}``: a loaded model's id names its version).

- [ ] **Step 1: the type and the pure plan** — `Ghost.target` becomes `{ unique_id?: string; type_before?: string; ifc_guid?: string | null }`. Add:
```ts
/** MA-3d: what Highlight in 3D does with a storey's ghosts and what each loaded model answered for their GlobalIds (null = not in it):
 *  the highlighter's map (modelId → the local ids found) and the words. Pure. */
export function highlightPlan(ghosts: Ghost[], found: Map<string, (number | null)[]>): { map: Record<string, Set<number>>; guids: string[]; words: string } {
  const guids = [...new Set(ghosts.map((g) => g.target?.ifc_guid).filter((g): g is string => typeof g === "string" && g.length > 0))];
  const changes = ghosts.filter((g) => g.op && g.op !== "create");
  const withoutGuid = changes.length - changes.filter((g) => g.target?.ifc_guid).length;
  if (!guids.length) return { map: {}, guids, words: withoutGuid > 0
    ? "Nothing to highlight: these ghosts were filed before the add-in sent IFC GlobalIds — a new Promote run sends them."
    : "Nothing to highlight: this storey proposes only creates (they have no element in the model yet)." };
  if (!found.size) return { map: {}, guids, words: "Load a model first (Files ▸ Open 3D) — nothing is loaded to highlight in." };
  const map: Record<string, Set<number>> = {};
  const hit = new Set<string>();
  for (const [modelId, ids] of found) ids.forEach((id, i) => { if (id != null) { (map[modelId] ??= new Set()).add(id); hit.add(guids[i]); } });
  const models = [...found.keys()].join(", ");
  const missing = guids.length - hit.size;
  return { map, guids, words: hit.size === 0
    ? `None of the ${guids.length} ghost(s) is in the loaded model(s) (${models}) — the loaded version may be older than Revit's model; load the newest published version, or Revit may be newer.`
    : `Highlighted ${hit.size} of ${guids.length} ghost(s) in ${models}` + (missing ? ` — ${missing} not in them: the loaded version may be older than Revit's model (Revit may be newer)` : "") + (withoutGuid > 0 ? `; ${withoutGuid} ghost(s) filed before the add-in sent GlobalIds cannot be highlighted` : "") + "." };
}
```
- [ ] **Step 2: the panel** — `reviewDeskPanel(opts: { baseUrl?: string; components?: OBC.Components } = {})` (`import * as OBC from "@thatopen/components"; import * as OBF from "@thatopen/components-front";`). Inside, after `say`:
```ts
  // MA-3d: Highlight in 3D — a storey's ghosts in the viewer's loaded models, by each element's IFC GlobalId. No model is loaded here:
  // the Files panel's Open 3D loads a version (its model id names the version), and the words say which versions answered.
  const highlight = async (ghosts: Ghost[]) => {
    const comps = opts.components;
    if (!comps) { say("Highlighting needs the viewer — not available on this page.", true); return; }
    const fragments = comps.get(OBC.FragmentsManager);
    const highlighter = comps.get(OBF.Highlighter);
    const guids = [...new Set(ghosts.map((g) => g.target?.ifc_guid).filter((g): g is string => !!g))];
    const found = new Map<string, (number | null)[]>();
    if (guids.length) for (const model of fragments.list.values()) {
      const m = model as unknown as { modelId: string; getLocalIdsByGuids(g: string[]): Promise<(number | null)[]> };
      try { found.set(m.modelId, await m.getLocalIdsByGuids(guids)); }
      catch (e) { say(`The model "${m.modelId}" could not answer for the GlobalIds — ${(e as Error).message}`, true); return; }
    }
    const plan = highlightPlan(ghosts, found);
    try { if (Object.keys(plan.map).length) await (highlighter as unknown as { highlightByID(n: string, m: Record<string, Set<number>>, a: boolean, b: boolean): Promise<void> }).highlightByID("select", plan.map, true, true); }
    catch (e) { say(`Highlighting failed — ${(e as Error).message}`, true); return; }
    say(plan.words, !Object.keys(plan.map).length);
  };
  const clearHighlight = async () => {
    try { await (opts.components?.get(OBF.Highlighter) as unknown as { clear(n: string): Promise<void> } | undefined)?.clear("select"); say("Highlight cleared."); }
    catch (e) { say(`Clearing failed — ${(e as Error).message}`, true); }
  };
```
In `show()`, inside the storey loop, after the summary line: a row `el("div", "", "display:flex;gap:.4rem;margin:.2rem 0")` holding `btn("Highlight in 3D", () => void highlight(s.groups.flatMap((g) => g.ghosts.map((x) => x.el))))` and `btn("Clear", () => void clearHighlight())`. `main.ts:250` → `reviewDeskPanel({ baseUrl: SERVICE_URL, components })` (the `components` instance exists in `main.ts` — find its variable name; the clash panel is built with it).
- [ ] **Step 3: tests** in `review-desk.test.ts`, a new describe `"MA-3d — Highlight in 3D: the plan and its words"`: three ghosts (two retypes with GUIDs `A`/`B`, one create) and `found = Map{ "Tower@P03": [7, null] }` → `map { "Tower@P03": Set{7} }`, words `Highlighted 1 of 2 ghost(s) in Tower@P03 — 1 not in them: the loaded version may be older than Revit's model (Revit may be newer).`; two models, the second holding B → `Highlighted 2 of 2 ghost(s) in Tower@P03, Tower@P04.`; an empty `found` → the "Load a model first" words; ghosts with no GUID (retypes from an older add-in) → the "filed before the add-in sent IFC GlobalIds" words; creates only → the "only creates" words; no hit → the "None of the … is in the loaded model(s)" words; a retype without a GUID beside two with → the `; 1 ghost(s) filed before … cannot be highlighted` clause. Run `npx vitest run src/setups/review-desk.test.ts`.
- [ ] **Step 4: commit** — `feat(web): MA-3d - the review desk highlights a storey's ghosts in the viewer's loaded models by their IFC GlobalIds (Highlight in 3D / Clear), and says how many were found, in which loaded versions, and that a ghost not found may be newer than the loaded version`

### Task 4 — Final checks (nothing to commit)
From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore the fixture if listed), `npm run build 2>&1 | tail -3` (builds), `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). From the root: `dotnet run --project tools/promote-check 2>&1 | tail -2`; builds 2022/2024/2026/2027 (`-p:DeployToRevit=false`, 0 errors). `git status --short` shows only `.claude/` and `ab.html`. Report the totals and `git log --oneline master..HEAD`.

## Live drill MA3d (the controller, after the build)
- D-1 bridge (4101): a retype with `target.ifc_guid` is kept on the 201; `"abc"` is the 400 in words.
- R-1 Revit 2024, the branch's add-in: Promote (DD) on a scratch copy bound to a project with Promote standards (`ma3b3`): the filed storey's elements carry `target.ifc_guid` (read through 4101).
- W-1 the local app (the founder's session): Files ▸ Open 3D on a published version, Review ▸ Highlight in 3D on a storey → the words and the highlight — **owed to the founder's session** (a published `.frag` of the same model Revit promoted is needed; pinned offline meanwhile).
- Merge, 1.0.54 publish (web changed), bridge restart on master (the validator changed), deploy 2021–2027.

## Next (out of scope here)
- MA-3d slice 2 — the proposal model: the one-hour spike (a bridge-made `.frag` from `ifc-writer.ts` with the `Sentinel_Evidence` pset loads and colours as its own model in fragments 3.4.7; the coordinate frame), then `proposal.frag` per changeset and the desk's "Show creates in 3D". `PointCloudLoader`/`SplatLoader` wait for MA-4's evidence.
