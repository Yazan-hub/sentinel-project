# MA-0 Promote walls v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote a concept model's walls to DD by the office standard: retype to the exact catalogue type, attach tops/bases to story levels, as reviewed changesets with provenance and an undo watcher.

**Spec:** docs/strategy/2026-09-30-model-automation-design.md §7.2 MA-0 (founder decisions: Option C; test model = the BDS office template the catalogue came from — `BDS_Project Number_Project Name (Template)`, a scratch detached copy, never the original).

**Global constraints:** builds Revit 2024/2025/2026; Revit API only on the API thread; exact typing, no type ever created (D16); every write goes through the reviewed changeset path; secret-scan before push; branch + --no-ff.

---

# MA-0 "Promote walls v0": implementation brief

MA-0 adds two operations to the existing changeset path: `retype` and `attach`. It also stops the executor from taking the model's first type when a type name is empty, and adds a wall rule file for the design-development (DD) stage, a planner in the Revit add-in, a minimal provenance stamp and a first version of an undo watcher.

The source of truth is `docs/strategy/2026-09-30-model-automation-design.md`: §7.2 MA-0 at `:1014-1033`, the ops table in §6.3 at `:670-754`, the stamp in §6.4 at `:756-779`, the ledger row in §6.6 at `:831`, the route in §6.8 at `:876`, and "one Promote run" in §3.4 at `:332-348`.

The work was read-only: nothing was edited, and no Revit, browser or computer-use tool was called.

About your note on the ribbon: the add-in makes its own **Sentinel** tab (`SentinelAddin/App.cs:349-350`). It sits at the right end of Revit's ribbon tab row. The Enscape plug-in does not block it. The only thing to clear first is the Windows 11 Snap Layouts flyout, which can cover the right end of the ribbon (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:897`).

---

## 0. Two problems in today's code to fix first

1. **A signed-in Revit gets a 403 when it reports a changeset result.**
   - `reportResult` accepts only the machine credential (`WebApp/bridge/changesets-store.mjs:81`).
   - When a person is signed in, the add-in sends that person's token instead (`SentinelAddin/Coordination/BcfConfig.cs:30`), so `myRole` returns their membership role, not `service` (`WebApp/bridge/members-store.mjs:136-144`).
   - Result: the walls change in Revit, the report fails, and the changeset stays `proposed`. Because the no-retry list at `Commands.ReviewChangesets.cs:127` covers only 400, 404 and 409, the Retry dialog loops.
   - This already affects Review AI Proposals today. The owed row B31-3 would hit it.
   - The code comment already plans the change: "When Revit signs in per user — H4 — this becomes that user's contributor check" (`changesets-store.mjs:78-80`).
2. **The bridge drops new fields without an error, and the executor would then crash.**
   - `validateChangeset` rebuilds each element as only `{proposal_guid, kind, validate, place}` (`changesets-logic.mjs:61-66`).
   - It also requires a `place` with a LocationCurve for every wall (`changesets-logic.mjs:18-22`).
   - The executor picks elements by kind only, e.g. `Where(e => e.Kind == "wall")` (`ChangesetExecutor.cs:100`). A retype ghost would therefore reach `Wall.Create` with a null curve. That throws a NullReference and rolls back the whole changeset (`ChangesetExecutor.cs:154-158`).

---

## 1. Files to create or change

| File | Change | Why / cite |
|---|---|---|
| `WebApp/bridge/changesets-logic.mjs` | Add `OPS`, per-op checks, a required `TypeName` on wall and floor creates, and pass `op`, `target`, `reason` and `exceptions` through | Today's element rebuild is at `:61-66` and the return at `:69`. `VOCABULARY` stays frozen (`changesets-logic.test.mjs:22`) |
| `WebApp/bridge/changesets-store.mjs` | Store `exceptions`. Open `/result` to contributors (`:81` → `requireMinRole`). Add `reportReverted`. Add `takeWriteBudget` to `wire()` | `wire` is at `:13-23`, the stored doc at `:45-52`, the proposed ledger row at `:54-55`. The budget helper is `cde-store.mjs:1034-1041` |
| `WebApp/bridge/bcf-service.mjs` | Add the `/reverted` route after `:1616`. Set the actor default at `:1609`. Update the comment at `:1596-1599` | This is the existing changesets dispatch |
| `WebApp/bridge/mcp-server.mjs` | The tool description (`:101`) names the ops and says `TypeName` is required | Agents today omit `TypeName`, and the executor fix would decline their changesets |
| `WebApp/bridge/fixtures/changeset-ops/promote-body.json` (new) | One planner body, read by both vitest and `promote-check` | This is the parity guard against silent drops. It follows the contract-parity pattern (`contract-parity.test.mjs:9-10`) |
| `demo/bds-pilot/bds-dd-walls-guideline.json` (new) | The DD wall rule file | Because the name contains `guideline`, `ghost-standards-check` parses it automatically (`tools/ghost-standards-check/GuidelineChecks.cs:131-145`) |
| `SentinelAddin/Coordination/ChangesetClient.cs` | DTO fields, plus `Propose` and `ReportReverted` | Today's DTOs are at `:23-32`, `:52-59`, `:68-77`, and `ReportResult` is at `:130-146`. There is no Propose method |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` | Refuse an empty type name (the gap). Dispatch on op, adding retype and attach. Give the transaction a unique name. Write the stamp | The fallback is at `:58` and `:67`, the transaction at `:79`, the loops at `:84-141`, the guard at `:146-147` |
| `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` (new, pure) | Facts in; ghosts and exceptions per storey and request bodies out | Follows the pure-planner pattern of `MassingPlanner.cs` and `ViewPlanner.cs` |
| `SentinelAddin/Engine/ProvenanceStamp.cs` (new) | Extensible Storage stamp. The pure JSON part is compiled under `SENTINEL_CHECK` | Copies the schema pattern at `SettingsManager.cs:69-79`. The `#if` split follows `DocPin.cs:4-7,22-31` |
| `SentinelAddin/Engine/UndoWatcher.cs` (new) | Transaction name, registry, `DocumentChanged` handler | The add-in has no `DocumentChanged` code today |
| `SentinelAddin/Commands.ReviewChangesets.cs` | Move `:63-116` into `internal static void Open(...)`. `Report` returns a bool and also stops on 401 and 403. Remember successful runs for the undo watcher | FIFO pick at `:59`, retry list at `:127` |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | Row labels that know the op, a pre-tick rule for Promote ops, and a "Sent to a person (N)" panel | Pre-tick at `:82` and `:64`, row label at `:92-96`, header at `:34-54` |
| `SentinelAddin/Commands.PromoteWalls.cs` (new) | Read facts, load standards, show the plan summary, file one changeset per storey, then open the review | Standards-load pattern: `Commands.Annotate.cs:29-30` |
| `SentinelAddin/App.cs` | Subscribe `DocumentChanged` next to `:86-96` and unsubscribe next to `:115-124`. Add a ribbon Sub after `:432` | Document events and ribbon |
| `tools/promote-check/` (new) | Offline check for the rule file, planner, body parity, DTOs, stamp JSON and undo matcher | Same pattern as `tools/guideline-check/guideline-check.csproj` and `tools/docpin-check` |
| `.github/workflows/ci.yml` | Add `promote-check` and `guideline-check` at `:55-66` and rename the step at `:53` | `guideline-check` is not in CI today |
| `demo/promote-sample/make-concept.py` (new) | Generates the seed changeset for the test model (standard library only) | See §5 |
| Docs | Add a README row in `demo/bds-pilot/README.md:16-17` style. Update the stale "B31-3..8 owed" at design `:967` and `:977` | Session 4 passed B31-3 for two windows, and B31-7 (`SIMULATION_ROOM_RUN:901-903`) |

**Founder decision (default chosen): where the rule file is read from.** Design `:1019` says "a JSON file in the repo, not an artefact yet". Two rules in the code apply: the add-in must never read a standard from the machine or from beside the DLL (`Sentinel.csproj:55-57`, `GuidelineMatcher.cs:6-9`).

- **Default:** keep the file in the repo and install it with the existing `guideline` kind, **only on the throwaway key `ma0-bds`**. `GhostStandards.Load` (`GhostStandards.cs:43-44`, `:84-94`) then reads it with no new loader code, and the review header shows its sha. No new artefact kind is created, and nothing is installed on `bds-office`.
- **Alternative:** ship it as an EmbeddedResource in the DLL. That breaks `Sentinel.csproj:55-57`.

---

## 2. Data shapes

### 2.1 What the planner posts: `POST /changesets/:key`

```json
{
  "name": "Promote walls (DD) · Level 1",
  "source": "promote",
  "actor": "yazan",
  "elements": [
    { "op": "retype", "kind": "wall",
      "target": { "unique_id": "5a1c…-0004c3f8", "type_before": "Generic - 200mm" },
      "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" },
      "reason": "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
      "validate": { "identity": { "Class": "IfcWall", "Name": "W 312312" } } },
    { "op": "attach", "kind": "wall",
      "target": { "unique_id": "5a1c…-0004c3f8" },
      "place": { "BaseLevel": "Level 1", "TopLevel": "Level 2" },
      "reason": "DD: top to next story Level 2 +0 (was unconnected)",
      "validate": { "identity": { "Class": "IfcWall", "Name": "W 312312" } } }
  ],
  "exceptions": [
    { "unique_id": "5a1c…-0004c401", "name": "W 312321",
      "reason": "gap: W 312321 (Generic - 125mm, Exterior) — \"BDS_EXT_ARC_CMU_125 mm\" is not in type_catalog@1 … Available: BDS_EXT_ARC_CMU_100 mm, …" }
  ]
}
```

- `unique_id` is Revit's UniqueId: a GUID, then `-`, then 8 hex digits for the element id.
- Each change is its own ghost, as §3.4 step 3 says (`:335`). One wall can therefore carry one retype ghost and one attach ghost.
- The 200 cap counts ghosts, not walls (`changesets-logic.mjs:10,46`).

### 2.2 What the bridge stores and returns

The rules follow §6.3 (`:704-707`): the bridge still makes `proposal_guid` (`changesets-logic.mjs:58`) and ignores any value sent in.

- **Element:** `{proposal_guid, kind, op, target: {unique_id, type_before} | null, reason | null, validate, place}`. `op` is always present, so the C# side never has to guess a default.
- **Changeset doc:** the fields at `changesets-store.mjs:45-52`, plus `exceptions: [{unique_id, name|null, reason}]`.
- **`changeset_proposed` ledger row:** its `new_value` (`:54-55`) also gets `exceptions: <count>`.

### 2.3 Bridge check: `changesets-logic.mjs`, replacing the single `checkPlace` call at `:55`

```js
export const OPS = ["create", "retype", "attach"];
const UNIQUE_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{8}$/i;
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
// in the map, with `const seen = new Set()` declared before it:
const op = el.op ?? "create";
if (!OPS.includes(op)) throw err(400, `${at}: op "${op}" is not supported — allowed: ${OPS.join(", ")}`);
if (op === "create") {
  checkPlace(el.kind, el.place, at);
  if ((el.kind === "wall" || el.kind === "floor") && !text(el.place.TypeName, 256))
    throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
} else {
  if (el.kind !== "wall") throw err(400, `${at}: ${op} is for walls only (v0)`);
  if (!UNIQUE_ID.test(el.target?.unique_id ?? "")) throw err(400, `${at}: ${op} needs target.unique_id, a Revit UniqueId`);
  const p = el.place ?? {};
  if (op === "retype" && !text(p.TypeName, 256)) throw err(400, `${at}: retype needs place.TypeName`);
  if (op === "attach" && (!text(p.BaseLevel, 256) || !text(p.TopLevel, 256) || p.BaseLevel === p.TopLevel))
    throw err(400, `${at}: attach needs two different levels, place.BaseLevel and place.TopLevel`);
  const k = `${op}:${el.target.unique_id.toLowerCase()}`;
  if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same wall`); seen.add(k);
}
if (el.reason != null && !text(el.reason, 500)) throw err(400, `${at}: reason must be text of at most 500 characters`);
```

- `exceptions` is optional. It may hold at most 1000 rows, and each row needs `unique_id` (at most 64 characters) and `reason` (at most 300). A bad row is a 400.
- Put the new `TypeName` check **after** `checkPlace`, so the test at `changesets-logic.test.mjs:179` still gets its LocationLoop error.
- The floor fixture at `:83` has no `TypeName`; add one to it.

### 2.4 The DD wall rule file: `demo/bds-pilot/bds-dd-walls-guideline.json`

It uses the `guideline@n` shape that `GuidelineMatcher.FromBodies` (`:184-190`) already reads. It has **no `default`**: a default would answer at confidence 0.6 (`GuidelineMatcher.cs:321-331`). The office intent is copied from `bds-guideline.json:67-76` (external walls are CMU) and `:90-99` (internal walls are gypsum).

```json
{
  "standard": "BDS DD walls v0 (MA-0)",
  "office": "BDS",
  "stage": "DD",
  "elements": [
    {
      "category": "Walls",
      "rules": [
        { "when": { "params": { "Function": "Exterior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_EXT_ARC_CMU_{thickness} mm" },
          "why": "DD: an exterior wall is the office's external CMU at the wall type's width." },
        { "when": { "params": { "Function": "Interior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_INT_ARC_GYPS_{thickness} mm" },
          "why": "DD: an interior wall is the office's gypsum partition at the wall type's width." }
      ]
    }
  ]
}
```

**How "Function and thickness, exact match" works:**

- **Function** is matched through the existing `params` condition. That match is a substring test (`GuidelineMatcher.cs:359`). It is still safe here, because no two WallFunction names contain each other: Interior, Exterior, Foundation, Retaining, Soffit, Coreshaft.
- **Thickness** is matched through `typePattern` plus `ThicknessMm`, rounded to the nearest mm (`:367-374`). The result must then equal a catalogue type name of the same category exactly (`:384-400`). If it does not, the answer comes back at confidence 0 with the available sizes listed.
- **Never put thickness in `params`.** `"50"` is a substring of `"150"`.
- The planner adds one more guard: a width that is not a whole millimetre goes to a person.

**Real targets in the catalogue:**

- `BDS_EXT_ARC_CMU_100/200/300/400 mm` (`bds-type-catalog.json:11798-11831`)
- `BDS_INT_ARC_GYPS_50 mm` and `BDS_INT_ARC_GYPS_100 mm` (`:12051`, `:12062`)
- `Generic - 125mm` (`:12315`) has no BDS equivalent, so it is always a gap.

**Resolved offline against the real catalogue:**

| Function and width | Result |
|---|---|
| Exterior 100/200/300 | CMU at confidence 1 |
| Exterior 125/150 | Confidence 0, with the CMU sizes listed as available |
| Interior 100 | GYPS_100 |
| Interior 125/200/300 | Confidence 0 |
| Foundation | Source `none` |

### 2.5 Stamp: `ProvenanceStamp.cs`

- The schema copies `SettingsManager.cs:69-79`: a new fixed Guid generated once, read and write access both Public, and one string field `json`.
- The schema name is `SentinelProvenanceV1`. A schema name cannot contain dots, so the design's `Sentinel.Provenance.v1` cannot be used as written.
- The stored value:

  ```json
  { "v": 1, "changeset_id": "3f2a…", "source": "promote", "proposal_guids": ["s1…", "8c1e…", "91d0…"],
    "unique_id_at_placement": "5a1c…-0004c3f8", "changeset_ids": ["seed…", "3f2a…"] }
  ```

- A schema holds one entity per element, and a new write overwrites it (RevitAPI.xml:274114-274126). So the executor stamps **once per element** with every guid that touched it:
  `foreach (var g in result.Applied.GroupBy(a => a.RevitUniqueId)) ProvenanceStamp.Write(doc.GetElement(g.Key), cs.Id, cs.Source, g.Select(a => a.ProposalGuid));`
- (Review fix) `Write` **merges** the element's own earlier stamp: `changeset_id` and `source` are the latest changeset's; `proposal_guids` and `changeset_ids` list every one that touched the element, oldest first; `unique_id_at_placement` stays the first placement's. A copy's stamp (another element's `unique_id_at_placement`) is not merged. So Promote on a seed wall placed by Review AI Proposals keeps the seed's provenance.
- It writes **inside the changeset transaction**, just before the count guard at `:146`, so Ctrl+Z removes the stamp too.

### 2.6 `changeset_reverted`

- **Route:** `POST /changesets/:key/:id/reverted` with body `{op: "undo"|"redo", guids: [...], actor}` returns 201 and the ledger row.
- **Ledger row:** `audit(proj.id, "changeset", id, "changeset_reverted", actor||"revit", {status}, {op, guids, count})`, using the signature at `cde-store.mjs:980-988`. The name is not reserved (`:999-1000`).

```js
export async function reportReverted(key, id, { op, guids } = {}, actor, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor");                  // service and signed-in contributors both pass
  if (!["undo", "redo"].includes(op)) throw err(400, 'op must be "undo" or "redo"');
  if (!Array.isArray(guids) || !guids.length || guids.length > 200 || new Set(guids).size !== guids.length || !guids.every((g) => typeof g === "string"))
    throw err(400, "guids must be 1–200 distinct proposal_guids");
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (cs.status !== "applied" && cs.status !== "partially_applied") throw err(409, `changeset is ${cs.status} — only an applied changeset can be undone`);
  const applied = new Set((cs.result?.applied || []).map((a) => a.proposal_guid));
  const stray = guids.find((g) => !applied.has(g));
  if (stray) throw err(400, `"${stray}" was not applied by this changeset`);
  d.takeWriteBudget("revit reports", { perUser: 20, all: 60 });
  return d.audit(proj.id, "changeset", id, "changeset_reverted", actor || "revit", { status: cs.status }, { op, guids, count: guids.length });
}
```

- **Route line** after `bcf-service.mjs:1616`: `if (p2 && p3 === "reverted" && req.method === "POST") return send(res, 201, await ch.reportReverted(key, p2, body, actor));`
- **Actor default** at `:1609`: `["result", "reverted"].includes(p3) ? "revit" : "agent"`.
- Do **not** route this through `/cde/:key/audit` by adding `changeset` to `REVIT_REPORT_TYPES` (`cde-store.mjs:1048`). That path never checks the guids against the changeset.
- v0 does not change the doc's status. The ledger row is the record.

### 2.7 Planner types: `PromoteWallsPlanner.cs`, pure

It uses no Revit types, and every file needs explicit `using` lines because implicit usings are off on net48 (`Sentinel.csproj:26`).

```csharp
public sealed class WallFact  { public string UniqueId, Label, TypeName, Function, BaseLevel, TopLevel /*null = unconnected*/, Stamp;
                                public double WidthMm, BaseOffsetMm, TopOffsetMm; public bool IsBasic, InGroup, Structural /*(F1 fix)*/; }
public sealed class LevelFact { public string Name; public double ElevationMm; public bool IsStory; }
public sealed class PromoteGhost { public string Op, UniqueId, Label, TypeBefore, TypeName, BaseLevel, TopLevel, Reason, Note /*(F2 fix) never posted*/; }
public sealed class PromoteHeld  { public string UniqueId, Label, Reason; }
public sealed class StoreyPlan   { public string Storey; public int Walls /*DD-now denominator*/, DdNow, OfficeTyped /*(F1 fix)*/, Stamped;
                                   public List<PromoteGhost> Ghosts = new(); public List<PromoteHeld> Held = new(); }
public static List<StoreyPlan> Plan(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels, IReadOnlyDictionary<string, string> docBasicWallTypes /*name → type Function (F2 fix)*/, GuidelineMatcher m);
public static List<object> Bodies(IReadOnlyList<StoreyPlan> plans, string actor, int max = 200);
// (review fix) chunks BY WALL at <= max ghosts (a wall's retype and attach stay in one changeset); a storey's held rows
// spread over its chunks at <= 1000 each (the bridge's MAX_CHANGESET_EXCEPTIONS; overflow = one "… and N more" row);
// the held rows of a storey with no ghosts ride on the first body filed, named "<storey> · <wall>"
```

**Rules for each wall.** Every "held" line becomes an exception row, with the reason text shown.

| Condition | Result |
|---|---|
| Not a Basic wall | Held: "not a basic wall — Promote v0 types basic walls only" |
| In a group | Held: "in a group — Sentinel does not edit group members". `ChangeTypeId` throws inside a group (RevitAPI.xml:274943-274985) |
| Base level is not a Building Story | Held |
| **Settled** (drill F1/F2 fix): the current type is one the DD rules produce — a Walls rule's `use.type`, or its `use.typePattern` with `{thickness}` a number, case-insensitive (`GuidelineMatcher.RuleProduces`) | No retype; the type is OK, whatever Function the template gave it (so a second run cannot flip a gypsum partition whose type says Exterior to CMU). The top is judged as below |
| **Office-typed** (F1 fix): otherwise, the guideline names an office code (`office`, e.g. `BDS`) and the type name starts with `BDS_` | Nothing proposed, nothing held, not in the DD-now denominator: not a concept wall. Counted in `OfficeTyped`; the summary says "N on other office types, left as is". Skipped when the guideline has no office code |
| **Structural** (F1 fix): otherwise, the wall's Structural usage is on (`WALL_STRUCTURAL_SIGNIFICANT` = 1) | Held whole: "structural wall — Promote v0 does not retype or re-top structure; a person decides" |
| Width not a whole mm | Held: "…exact match only (D16)" |
| Type check | Call `m.Resolve(new GuidelineInput { Category = "Walls", Params = { ["Function"] = fact.Function }, ThicknessMm = fact.WidthMm })` (`:299-334`) |
| Result is a rule at confidence 1 and equals the current type | Type is already OK |
| Result is a rule at confidence 1, but the type is not in `docBasicWallTypes` | Held: "…in the catalogue but not loaded in this model — Sentinel creates no types" |
| Result is a rule at confidence 1 and the type is loaded | Retype ghost, with `TypeBefore` set. If the target's type Function in this model differs from the wall's (F2 fix), the ghost is still proposed — the rule is the office's — its reason ends " — note: <target> is Function <X> in this model" and the summary lists each such type once under "Template check" |
| Result is a rule at confidence 0 | Held with `m.Gap(label, res.Why)`, which names the catalogue (`:194`) |
| Result is `default` or `none` | Held: "no DD rule for Function X in <guideline label>" |
| Attach check | Find the next Building Story above the base level. If there is none, hold the wall ("no story level above"). If the base offset is not 0 (more than 0.5 mm off), hold it ("attaching would move the wall"). If the top is not already the next story at offset 0, file an attach ghost — unless the wall's top now (top level + offset, or unconnected: base + offset + Unconnected Height) is above the next story: then hold it ("attaching would cut the wall down to one storey; a person decides"). The executor refuses an attach whose base is no longer the planned level at +0, or whose top is above the new top (the model changed since the plan) |
| No type catalogue installed (review fix) | The matcher would answer the pattern unchecked, so the type is held ("no type catalogue installed … (D16)"); the attach stays |
| **Every concept wall on the storey shares one type** (§3.4 step 4, `:336`; settled and office-typed walls are not concept walls) | Retype ghosts for that storey are replaced by held rows. Attach ghosts stay |
| `DdNow` / `Walls` | `DdNow` counts walls whose type is OK **and** whose top is OK. This is the drill's "LOD-300 rule passes before and after". `Walls` (its denominator) is every wall based on the storey except the office-typed ones: concept walls, held included, plus settled walls |

---

## 3. Code sketches for the add-in

**Executor** (`ChangesetExecutor.cs`):

- Add `static bool IsCreate(ChangesetElementDto e) => e.Op is null or "create";` and add `IsCreate(e) &&` to each kind loop at `:84`, `:92`, `:100` and `:117`.
- Replace `:58` and `:67` with `throw new InvalidOperationException("gap: no type name — Sentinel never takes the model's first type; re-propose with a TypeName");`. Rewrite the comment at `:49-52` to match.
- Add a `LevelNamed(doc, name)` helper: trim the name, match it exactly as `:38-39` does, and throw when it is blank or missing.
- Name the transaction with `UndoWatcher.TxName(cs.Name, cs.Id)` at `:79`. That gives `Sentinel AI changeset: {name} [{id[..8]}]`.
- Add two loops after the floor loop:

```csharp
foreach (var el in toPlace.Where(e => e.Op == "retype"))
{
    var w = TargetWall(doc, el);                              // doc.GetElement(uid) as Wall ?? throw "not in this model — re-run Promote"
    var wt = ResolveWallType(doc, el.Place?.TypeName);        // blank → gap; missing → throw (:59-60): only a type already in the document
    if (el.Target?.TypeBefore != null && !string.Equals(w.WallType.Name, el.Target.TypeBefore, StringComparison.OrdinalIgnoreCase))
        throw new InvalidOperationException($"wall {w.UniqueId} is now \"{w.WallType.Name}\" — the model changed since the plan; re-run Promote");
    if (!w.IsValidType(wt.Id)) throw new InvalidOperationException($"\"{wt.Name}\" is not a valid type for wall {w.UniqueId}");
    if (w.ChangeTypeId(wt.Id) != ElementId.InvalidElementId) throw new InvalidOperationException("Revit replaced the wall on retype");
    Collect(result, el, w);
}
foreach (var el in toPlace.Where(e => e.Op == "attach"))
{
    var w = TargetWall(doc, el);
    var b = LevelNamed(doc, el.Place?.BaseLevel); var top = LevelNamed(doc, el.Place?.TopLevel);
    if (top.Elevation <= b.Elevation) throw new InvalidOperationException($"{top.Name} is not above {b.Name}");
    Set(w, BuiltInParameter.WALL_BASE_CONSTRAINT, b.Id);  Set(w, BuiltInParameter.WALL_BASE_OFFSET, 0.0);
    Set(w, BuiltInParameter.WALL_HEIGHT_TYPE, top.Id);    Set(w, BuiltInParameter.WALL_TOP_OFFSET, 0.0);   // Set: null/read-only/false → throw
    Collect(result, el, w);
}
```

- Retype runs before attach. Revit 2024 has no `Wall.AddAttachment`, so "attach" means setting the constraint parameters (RevitAPI.xml:294291-294311).
- An unknown op is still caught by the count guard at `:146-147`. Update its message to say "kind or op".

**Undo watcher** (`Engine/UndoWatcher.cs`):

- **Pure part:** `TxName(name, id)`; `Remember(tx, key, csId, guids)`, which fills a `ConcurrentDictionary`; `Hits(IEnumerable<string> names)`; and `OpOf(undone, redone)`.
- **Revit part:** `OnChanged(object s, DocumentChangedEventArgs e)`.
  1. Work out `op` from `e.Operation`: TransactionUndone gives `undo`, TransactionRedone gives `redo` (RevitAPI.xml:254748-254776). For any other operation, return.
  2. For each entry in `Hits(e.GetTransactionNames())` (:254638-254650), start a `Task.Run` that calls `ChangesetClient.ReportReverted(BcfConfig.Load(), …)`.
  3. Log the outcome with `App.PanelVm?.LogDoctor(...)`, which already moves to the UI thread (`UI/SentinelPanelViewModel.cs:111`).
- The handler makes no API writes and no blocking HTTP calls on the event thread.
- Subscribe with `app.ControlledApplication.DocumentChanged += Engine.UndoWatcher.OnChanged;` next to `App.cs:86-96`, and unsubscribe next to `:115-124`.
- **Registration** happens in the shared review callback (`Commands.ReviewChangesets.cs:108`), after a successful report:
  `if (Report(...)) UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));`

**Review window** (`ChangesetReviewWindow.cs`):

- Pre-tick: `static bool PreTick(ChangesetDto cs, ChangesetElementDto el) => el.Verdict?.Status == "accepted" || (cs.Source == "promote" && el.Op is "retype" or "attach");`. Use it at `:82` and `:64`, and rename that button "Tick suggested".
  - This follows §3.4 step 7 (`:339-340`): pre-tick single-answer ops.
  - The verdict is ignored for Promote ops because retype and attach ghosts carry no property sets, so their IDS verdict certifies nothing. The badge still shows it.
- Row labels (`:92-96`):
  - `retype: {name} · {Target.TypeBefore} → {Place.TypeName}`
  - `attach: {name} · {BaseLevel} → top {TopLevel}`
  - The tooltip is `el.Reason`.
- Go button (`:63`): "Apply ticked in Revit".
- After the header (`:53-54`), add an Expander "Sent to a person (N)" docked at the top, with a maximum height and a scroll viewer. Its orange rows `{name} — {reason}` cannot be ticked; copy `UI/NamingManagerWindow.cs:116-117` and `:159`.

**Client** (`ChangesetClient.cs`):

- `ChangesetDto Propose(BcfConfig cfg, string key, object body, out string error)`: POST `/changesets/{key}`, expect 201, deserialise.
- `bool ReportReverted(BcfConfig cfg, string key, string id, List<string> guids, string op, out string error)`: POST `…/{id}/reverted` with `{op, guids, actor = Environment.UserName}`.
- Both use `WriteHttp`, like `:130-146`, with `DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull` (precedent at `Coordination/OfficeSnapshotDto.cs:24`).
- New DTO fields:
  - `ChangesetElementDto`: `Op` ("op"), `Target` (`TargetDto {unique_id, type_before}`), `Reason` ("reason").
  - `PlaceDto`: `BaseLevel`, `TopLevel`.
  - `ChangesetDto`: `Exceptions` (`List<ExceptionRowDto {unique_id, name, reason}>`, initialised to `new()`).

**Promote command** (`Commands.PromoteWalls.cs`):

1. Mark it `[Transaction(Manual)]`. Check the document is bound, as `Commands.ReviewChangesets.cs:38-43` does.
2. If `FetchProposed` finds a pending changeset with `Source == "promote"`, call `ReviewChangesetsCommand.Open(...)` on it and stop. This means Promote never plans on top of an unreviewed Promote changeset.
3. On the API thread, read the facts:
   - Basic `WallType` names into a case-insensitive set.
   - Levels, using `LEVEL_IS_BUILDING_STORY == 1` (RevitAPI.xml:289911).
   - For each wall: `WallType.Function.ToString()`, `WallType.Width*304.8`, `WALL_BASE_CONSTRAINT`, `WALL_BASE_OFFSET`, `WALL_HEIGHT_TYPE`, `WALL_TOP_OFFSET`, `GroupId`, and `ProvenanceStamp.Read`.
4. Load standards with `Task.Run(() => GhostStandards.Load(key, layers: false)).GetAwaiter().GetResult()`, the pattern at `Commands.Annotate.cs:30`. If there is no guideline, show a dialog that names `GuidelineSource.Label` and stop.
5. Call `Plan`. Show a summary TaskDialog: the `standards.Header` line (`GhostStandards.cs:30`), and for each storey its ghosts, walls sent to a person, `DD now x/y` and stamped count. Ask "File N changesets?" and treat No as a read-only run.
6. Call `Propose` for each body, then `Open` on the first one.

Ribbon: `Sub(chain, "Sentinel_PromoteWalls", "4 · Promote walls (DD)", "Sentinel.Commands.PromoteWallsCommand", "ghost", …)` after `App.cs:432`.

---

## 4. Order of work: 9 tasks, each with its own check

The baseline, run from `WebApp/`, is `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs bridge/mcp-server.test.mjs`: 69 passing (22 + 17 + 30). The full suite is `npm test` (`WebApp/package.json:8`).

1. **Bridge ops, exceptions and required TypeName** (`changesets-logic.mjs`).
   - New cases in `changesets-logic.test.mjs`:
     - `op` defaults to `create` and is echoed back.
     - An unknown op is a 400 that names the element index.
     - Retype needs a UniqueId-shaped target and a TypeName, but no LocationCurve.
     - Attach needs `BaseLevel` different from `TopLevel`.
     - Retype or attach on a floor is a 400.
     - The same (op, wall) pair twice is a 400; retype plus attach on one wall is fine.
     - A wall or floor create without TypeName is a 400.
     - `exceptions` are kept and checked.
     - A posted `proposal_guid` is replaced by the bridge's own.
   - Add `TypeName` to the fixture at `:83`.
   - **Check:** the vitest command above.
2. **Bridge store, route and MCP.**
   - `exceptions` go on the doc and their count on the ledger row.
   - `/result` accepts contributors: change `:81` to `await d.requireMinRole(key, "contributor")`.
   - Add `reportReverted` and the route.
   - Add retype, attach and TypeName to the MCP description.
   - Tests:
     - Rewrite `changesets-store.test.mjs:210-221` so a viewer gets a 403 before anything is read, and a contributor's result and the service's result both land.
     - `reportReverted` happy path (service and contributor) writes `[3] === "changeset_reverted"` with `{op, guids, count}`, and `docReplaceIfStatus` is never called.
     - `reportReverted` refusals: 403 viewer, 404, 409 for proposed, declined or withdrawn, and 400 for a stray guid, an empty or duplicate list, or a bad op.
     - `mcp-server.test.mjs:143-149` also matches `/retype/` and `/TypeName/`. Keep the `wall, floor, level, grid` wording, which the test pins.
   - **Check:** the vitest command, then `npm test`.
3. **Rule file and `tools/promote-check`, matcher part.**
   - `promote-check.csproj` is a copy of `tools/guideline-check/guideline-check.csproj` with these differences:
     - AssemblyName `promote-check`; add `SENTINEL_CHECK` to `DefineConstants`.
     - Compile `GuidelineMatcher.cs`, `TypeNameParse.cs`, `PromoteWallsPlanner.cs`, `Engine/ProvenanceStamp.cs` and `Engine/UndoWatcher.cs`.
     - Also compile `Coordination/ChangesetClient.cs`, `BcfConfig.cs` and `UserSession.cs`, with PackageReference `System.Security.Cryptography.ProtectedData 8.0.*`, as `tools/gate-check/gate-check.csproj:20-25` does.
   - `Check.cs` finds the repo root the same way as `guideline-check/Check.cs:23-26`.
   - Assertions:
     - The file parses with no error, and `ValidateAgainstCatalog()` returns nothing.
     - Exterior 100/200/300/400 each give `BDS_EXT_ARC_CMU_<n> mm` with source `rule` at confidence 1.
     - Exterior 150 gives confidence 0 and lists CMU 100, 200, 300 and 400.
     - Interior 50 and 100 give GYPS; Interior 200 gives confidence 0.
     - Foundation gives source `none`.
     - An Exterior rule never answers an Interior input.
   - **Check:** `dotnet run --project tools/promote-check`, plus `dotnet run --project tools/ghost-standards-check` (which now parses the new file) and `dotnet run --project tools/guideline-check` (still green).
4. **Pure planner, stamp JSON, undo matcher and parity fixture.**
   - `promote-check` assertions for the planner:
     - An Exterior 200 and Interior 100 storey gives retype ghosts with `type_before`, and attach ghosts to the next story.
     - A target type missing from the document is held, and no type is created.
     - A 125 mm wall is held with a gap text that names the catalogue label.
     - A storey where every wall has one type holds all its retypes but keeps its attaches.
     - The top storey holds the attach but still plans the retype.
     - A wall already on the target type with an attached top gives no ghost and adds 1 to `DdNow`.
     - A base offset other than 0 holds the attach.
     - A width that is not a whole mm is held. A group member or a non-Basic wall is held.
     - 201 ghosts give 2 bodies, and the exceptions ride only on the first.
   - Parity: a fixed plan serialised to JSON equals `WebApp/bridge/fixtures/changeset-ops/promote-body.json`, and each fixture element deserialises into `ChangesetElementDto` with `Op`, `Target.UniqueId` and `Place.BaseLevel` filled.
   - Stamp and undo: `ProvenanceStamp.Json` holds the four fields. `Hits` returns a hit for a remembered name, and nothing for an unknown name.
   - A vitest case checks that the same fixture passes `validateChangeset` and keeps `op`, `target`, `reason`, `place` and `exceptions`.
   - **Check:** `dotnet run --project tools/promote-check` and the vitest command.
5. **Executor and DTOs:** the gap refusal, op dispatch, transaction name and stamp write (§3).
   - **Check:** `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` (Revit 2024 builds net48, `Sentinel.csproj:16`), and the same with `-p:RevitVersion=2026`, which is the CI leg (`ci.yml:52`).
6. **Client, review-flow move and window.**
   - Add `Propose` and `ReportReverted`, and move the review flow into `Open(...)`.
   - `Report` returns a bool and stops on 401 and 403.
   - Add the pre-tick rule, op labels and exceptions panel.
   - **Check:** both builds, and `dotnet run --project tools/docpin-check`, because placement still goes through `ChangesetPlacementEvent.cs:33-37`.
7. **Promote command and ribbon.**
   - **Check:** the 2024 build. The first live read is the drill's dry-run step (§6, step 7).
8. **Undo watcher wiring** in `App.cs`.
   - **Check:** the build, plus the `Hits` and `OpOf` assertions in `promote-check`. Live proof is the MA0 Ctrl+Z row.
9. **CI and docs.**
   - Add `dotnet run --project tools/promote-check` and `dotnet run --project tools/guideline-check` to `ci.yml:55-66`.
   - Add the README row for the rule file.
   - Fix the stale design lines `:967` and `:977`.
   - Add `demo/promote-sample/make-concept.py`.
   - **Check:** CI green; `python demo/promote-sample/make-concept.py --help`; then the drill.

After each code task, run `graphify update .`, as `C:/Users/yazan/CLAUDE.md` asks. The graphify CLI was not on PATH in this shell, so if it is still missing, note that and move on.

---

## 5. Making the scratch test model

1. **Record the originals.**
   - `C:/Users/yazan/Documents/BDS_Template_yazan.hKNTHU.rvt`: sha256 `78152a5f…`, 54,521,856 bytes.
   - `…/BDS_Project Number_Project Name (Template)_yazan.hKNTHU.rvt`: sha256 `b7c98e13…`.
   - Both are checked again at the end (design `:1010`).
2. **Copy** the D8 file (design `:49`) to `C:/Users/yazan/Documents/sentinel-scratch/ma0/`, outside the repo.
   - The repo is public, and the root `.gitignore` has no `*.rvt` rule. Only `demo/aster/.gitignore:2` ignores `.rvt` files.
3. **Detach.** The file is a workshared local whose central path (`D:\Drive D 2\BDS\…`) no longer exists.
   - Open the copy in Revit 2024 with **Detach from Central ▸ Detach and preserve worksets**, then **Save As** `ma0-seed.rvt` in the scratch folder.
   - This follows the precedent at `docs/TESTING_PROTOCOL.md:143`.
4. **Bind** the model with Sentinel ▸ Standards ▸ Project Setup, web project `ma0-bds`. Then install, from `WebApp/`:
   - `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-dd-walls-guideline.json --project ma0-bds --kind guideline`
   - `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-type-catalog.json --project ma0-bds --kind type_catalog`
   - The PUT route creates the project if it does not exist (`artefact-store.mjs:252`).
5. **Read facts, read-only.** Use Properties and Edit Type in the UI. Never call `send_code_to_revit` (design `:1004`). Read:
   - each level's name, elevation and Building Story flag;
   - the Function and Width of `Generic - 200mm`, `Generic - 100mm` and `Generic - 125mm`;
   - whether `BDS_EXT_ARC_CMU_200 mm` and `BDS_INT_ARC_GYPS_100 mm` are loaded.

   **If the BDS targets are missing, stop and ask.** The catalogue came from `BDS_Project Number_Project Name (Template)` (`bds-type-catalog.json:3`, `docs/BDS_TEMPLATE_TYPE_AUDIT.md:3`), not from the D8 file. Switching test model is the founder's call.
6. **Make an interior source type if needed.** If `Generic - 100mm` reads Exterior, duplicate it as `MA0 Interior - 100mm` and set its Function to Interior. This type is part of the seed and is made by hand; MA-0 itself creates zero types.
7. **Generate the seed:**

   ```
   python demo/promote-sample/make-concept.py --l1 "<L1>:<mm>" --l2 "<L2>:<mm>" [--roof "MA0 Roof:<mm>"] --ext "Generic - 200mm" --int "MA0 Interior - 100mm" --gap "Generic - 125mm"
   ```

   - It writes one `concept.json`: about 40 walls (at most 200 elements).
   - Each storey gets 8 exterior walls around a 24 × 12 m outline, 10 interior partitions and 2 walls of 125 mm, which are the planted gaps.
   - All walls use `BaseElevation` = the level's elevation and `TopElevation` = base + 3000, so they are unconnected and Promote proposes attaching them.
   - Add a `level` element (`MA0 Roof`) only if nothing sits above L2. Otherwise every L2 attach is held.

   One element looks like:

   ```json
   {"kind":"wall","place":{"TypeName":"Generic - 200mm","LevelName":"<L1>","LocationCurve":{"start":[0,0,<L1mm>],"end":[12000,0,<L1mm>]},"BaseElevation":<L1mm>,"TopElevation":<L1mm+3000>},"validate":{"identity":{"Class":"IfcWall","Name":"MA0-L1-E01"}}}
   ```

   - Always set `BaseElevation`. Leaving it out gives an L2 wall a negative base offset (`ChangesetExecutor.cs:105,112`).
8. **Place the seed.**
   - Post it to `ma0-bds`, either with curl using the base URL and bearer that SIM B8 used (`SIMULATION_ROOM_RUN:361-364`), or with `sentinel_propose_changeset`.
   - Place it with **Review AI Proposals**. With no IDS installed, nothing is pre-ticked, so tick all rows by hand.
   - Check that the Undo list shows `Sentinel AI changeset: … [xxxxxxxx]`.
   - Check the new level's Building Story flag.
   - **Save** `ma0-seed.rvt` and close. Every MA0 attempt then starts from a fresh copy of this seed, so all attempts start the same way.

---

## 6. One Revit session: owed rows and drill MA0

These rows use the design's run order (`:988-1010`). Record the build hash, because the owed rows run on the MA-0 build.

| Row | Runnable on the BDS scratch? | How |
|---|---|---|
| **B31-3 Review AI Proposals pinned** | Yes, during seed step 8 | Open the review on the scratch. Bring a family editor from it to the front. Apply ticked. Expect "Sentinel did not place the proposals: switch back to …", and the proposals stay pending (`ChangesetPlacementEvent.cs:33-36`, `Commands.ReviewChangesets.cs:94-97`). Then switch back and place for real |
| **B31-3 Apply Standard pinned, B31-4 one Undo** | Yes, on a separate fresh copy | Apply the BDS pack and expect one "Sentinel: Apply standard" entry. A BDS-made file may have nothing to apply; record that instead of forcing it. Do the change-request Show after the rename (a view rename empties Undo, `SIM:892`). BCF zoom and isolate need an issue captured from scratch GlobalIds, so they are optional |
| B31-3 Clash Manager, B31-5, B32-6 | Probably not | Clash Manager checks RVT/IFC links against structure (`App.cs:364-365`), and the scratch has none. Record "not run" with the reason |
| **B31-6, B31-8** | Yes | Both are about File ▸ New project and do not depend on the model |
| **B32-1** | Yes, with a 2-rule test ruleset on `ma0-bds` (a Yes/No view parameter and a numeric one) | Set No and 0, and Scan Now flags neither |
| **B32-3** | Yes | Install `demo/bds-pilot/ruleset.json` on `ma0-bds`. Its rules use `{org}` (`ruleset.json:7-8,50`). Run ⚡ Fix |
| **B32-5 + the MA0 sync row** | Yes, with shared setup | Use `ma0-seed.rvt` (a central after detach), create a new local from it, and install a throwaway ruleset with one BLOCK rule. The BDS ruleset has none (`ruleset.json:14…142`) |
| Flipped BCF camera on a moved survey point | No | The survey point of this model is unknown |
| Change Requests Reject not registering (`SIM:905`) | Maybe | Only after a request-mode rename; check whether it registers |

**Drill MA0**, on a local of a fresh copy of the seed central (design `:1024-1031`):

1. Run **Promote walls (DD)** and choose **No** at the summary. Record "DD now" before.
2. Run it again and choose **Yes**. The Level 1 review window opens. Record the ticks and unticks, which are the edit count, and the time.
3. Apply. Run Promote again: it reopens the pending Level 2 Promote changeset. Apply that too.
4. Run Promote and choose **No** again. Record "DD after" and the "stamped by Promote" count (walls whose stamp was last written by a `source: promote` changeset — the seed's own stamps do not count).
5. Press Ctrl+Z once. Level 2 should revert. The Doctor log should show "changeset_reverted row posted", and `GET /cde/ma0-bds/audit` should show one row listing the guids. Press Ctrl+Y and check the redo row.
6. Measure the IDS pass rate before and after with the same tool both times, and report it as it is.
7. Switch to the BLOCK ruleset and sync. Record whether the sync is stopped (measured only).
8. Close Revit without saving. Check the sha256 of the originals. Record the rows after B34 in `SIMULATION_ROOM_RUN_2026-09-22.md`.

**Do no view actions between Apply and Ctrl+Z**: view renames empty Revit's Undo list (design `:42`).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A signed-in Revit gets a 403 on `/result` after the walls have already changed (`changesets-store.mjs:81`, `BcfConfig.cs:30`) | Task 2 opens it to contributors, as `:78-80` intended, and 401/403 join the no-retry list. The trade-off: a web contributor could also post a result. Otherwise, run the drill signed out |
| Old add-in with new bridge: an older executor treats retype as a wall create and declines | Deploy the add-in and bridge together. The new executor filters with `IsCreate`, and the count guard at `:146` catches anything else |
| One empty type declines the whole storey (all-or-nothing, `:154-158`) | The planner never files a ghost without a TypeName, and the bridge now gives a 400 on a create without one |
| The 200 cap counts ghosts, not walls | Chunk by wall at up to 200 ghosts. A storey with more than 200 ghosts gets two Undo entries (see cuts) |
| The params match is a substring test (`GuidelineMatcher.cs:359`) | Function is the only param. Thickness goes through `typePattern`, the catalogue and the document, all exact, plus the whole-mm guard |
| A default in the rule file answers at confidence 0.6 (`:321-331`) | The rule file has no default, and the planner requires `Source == "rule" && Confidence == 1` |
| The Function of the Generic types is unknown; the harvest drops it (`GoldenModelExtractor.cs:84` uses `AsString()` on an integer parameter) | Read it in step 5. Duplicate an Interior type for the seed. The one-type-per-storey rule holds ambiguous retypes |
| The D8 file is not the template the catalogue came from | The planner's document check shows it. In step 5, stop and ask; never switch silently |
| The model is a workshared local, and there is a central sibling | Detach and preserve worksets, and save only in the scratch folder. Never commit a `.rvt` |
| An agent can post `source: "promote"` and get pre-ticks | A person still clicks Apply. MA-1 moves the pre-tick decision to the bridge (§6.3) |
| Undo detection: many transaction-name prefixes, and the registry lives only in memory | The name carries the changeset id, and the registry is filled after a successful report. After a restart the registry is empty, but Revit clears Undo on reopen anyway. Filter on Undone and Redone, post on `Task.Run`, and log the outcome |
| An undo row fails to post (network) | The Doctor log line says "NOT posted" with the error. There is no retry queue in v0 |
| `FailureInterceptor` deletes or resolves some warnings on every transaction (`FailureInterceptor.cs:44-69`) | This conflicts with §3.4 step 8, "warnings are counted and shown, never erased", but is out of scope for MA-0. The drill records the warning count as it appears |
| Attach resets offsets | The planner holds walls with a base offset. Attach is proposed only when the target differs, and the row shows from → to |
| One stamp per element | Stamp once per element, grouping guids by UniqueId |
| JS and C# field names drift and a field is dropped silently | The shared fixture is checked by both vitest and `promote-check` |
| Revit 2024 (net48) is not built in CI (`ci.yml:42-52`) | Build locally with `-p:RevitVersion=2024` before the drill |
| HTTP on the UI thread: `Propose` is blocking, up to 120 s (addin audit AI-2, `revit-addin-audit.md:352`) | Accepted for v0. Only a few storeys are filed |

---

## 8. Deliberate cuts

- **Undo per storey only up to 200 ghosts.** One changeset per storey is one transaction and so one Undo entry. The `SentinelUndo.Run` wrap across several changesets (§3.4 step 8, `:344`) comes when a storey needs more than 200 ghosts.
- **Exceptions stay on the changeset doc.** They count on the ledger but are not held for review. `hold:type_gap` rows come in MA-2 (design `:830`).
- **`/reverted` writes a ledger row only.** It does not add a `reverted` status to the changeset.
- **No Withdraw on window close.** Running Promote again reopens the pending Promote changeset instead.
- **The rule file is not mirrored in the TypeScript tests.** In MA-0 only C# reads it; add a `guideline-bds.test.ts` block when the web resolves it.