# MA-5b-5 — Promote rehosts doors and windows no wall hosts (rehost + placeholder swap) — plan

**Goal:** a door or window that no wall hosts — a non-hosted family instance from Hypar, an IFC round trip, a massing or a
placeholder family (category Doors / Windows, family placed on a level, not in a wall) — is replaced by the office's wall-hosted type
of the same size, hosted in the one wall it stands in, when a person ticks it in Revit. The old instance is removed in the same Undo
step. This is the first time Sentinel removes an element; one Undo brings it back.

**Spec:** docs/strategy/2026-09-30-model-automation-design.md :328 (item 6: "rehost unhosted doors and windows. Swap placeholder
families (e.g. HyparDoor) for office families of the same size; otherwise a gap"), :535 / :751 (`rehost`), :1188 (this slice);
docs/strategy/2026-09-30-revit-addin-audit.md GHB-1 ("host each opening in the nearest wall within half its thickness … flip to match the
swing"). The batch plan's decision: keep D16 — typing by an exact DD rule; a match in the catalogue alone is held as office policy.
Founder: "go ahead with MA-5b", "can u run all phases all together?" (2026-10-11), "go ahead with batch 2" (2026-10-12).

## Facts this rests on (mapped 2026-10-12)

- Promote plans in C# (`PromotePlanner.Plan` → `Plan1` → `Swap` for doors and windows), reads the model in
  `Commands.PromoteWalls.cs` (`OtherFact` :504-545: `HostTypeName/HostBasic/HostFunction/HostLevel` from `fi.Host is Wall`), and today
  holds an unhosted one: `Swap` :352-354 "not hosted by a wall — rehosting is MA-5"; `LodState.cs:268` "Promote does not rehost".
- A Revit door or window cannot change host, and a non-hosted family cannot be hosted. So a rehost is always: create a wall-hosted
  instance of a wall-hosted family type, and delete the old one.
- Nothing in `ChangesetExecutor` deletes today (only Ghost's own import and a discarded duplicate type). The executor's hosted-opening
  create (`:577-623`) finds the host by point (`HostWalls`, `OddNear`, `PlacementGeometry.Host` within 1 mm on the level) and turns a
  block's opening to its hinge and swing side in a SECOND transaction (`TurnToBlocks` :919-948 — drill MA1b F-MA1b-2: the facing read
  inside the creating transaction can be reversed).
- One Undo per changeset (`UndoWatcher.TxName`); undo/redo is reported as `changeset_reverted`. Applied entries are rebuilt field by field
  on the bridge (`changesets-store.mjs:707-713`).

## Decisions

1. **One new op, `rehost`, for kinds door and window** — it covers both "rehost" and "placeholder swap". The new instance's type is the
   DD rule's office type of the same size (the existing `Swap` resolution, unchanged: D16, exact Width x Height, DR-1 door sizing, a
   catalogue-only match held as office policy, a gap held as a gap). The instance's own type is kept only when a DD rule already produces
   it (settled) or it carries the office prefix — and the executor still refuses a family that is not wall-hosted.
   Element:
   `{op:"rehost", kind, target:{unique_id, type_before:"Family : Type", ifc_guid?, at:[x,y,z]}, place:{LevelName, Location:[x,y,z],
   FamilyName, TypeName, Rotation?, Mirrored?, SillHeight?}, reason, validate:{identity:{Class, Name}}}`.
   `target.at` is where the old instance stood when Promote read it (its stale guard). `place.Location` is that point projected onto
   the host wall's location line, at the level's elevation. `Rotation`/`Mirrored` turn the new instance to the old one's hinge and
   swing side (decision 5). `SillHeight` (a window only) is the old instance's offset from its level.
2. **When Promote proposes a rehost** (a pure planner function over the facts it already reads — `PromotePlanner.FindHost`): the
   instance is a FamilyInstance of category Doors or Windows with no host, on a Building Story. Its candidates are the walls whose base
   level is its level and whose location line passes within half the wall's thickness of its point (at least 1 mm):
   - exactly one straight basic wall → that wall, provided the projected point leaves half the opening's width inside each end of the
     wall (else held "too close to the end of wall W …"); its type, Function and level are the host facts the door's location rule
     reads (inside/outside), as for a hosted door;
   - none → held "no wall on L passes within half its thickness of it — a person places it";
   - two or more → held "walls W1, W2 pass within half their thickness of it — a person picks its host";
   - the one candidate is curved, curtain, stacked or not basic → held "… a person decides the host".
   A door or window hosted by something that is not a wall (a roof's skylight) keeps its v1 hold.
3. **Never pre-ticked, a member's only.** The bridge refuses a rehost filed by the machine credential (the MCP server, a script): "a
   rehost removes an element — only a signed-in member files one (Promote in Revit)". `pretickOf` already gives it no pre-tick; a test
   pins it. A rehost's element carries no other ghost in the same changeset (a retype or set_parameter of a removed element would fail).
4. **The executor rehosts one element at a time inside a SubTransaction**, after every create (a wall the changeset creates may host it):
   a. **Kept** (not a failure; reported as rejected with its reason, the rest applied — MA-5b-4's path): the element is gone; it is now
      hosted (nothing to do); its type is not `type_before` (retyped since); it stands more than 2 mm from `target.at` (moved by hand
      since Promote read it); it is pinned, in a group, in a design option, or not editable by this user (workshared, borrowed); no wall
      passes its planned point now (the wall moved); a curtain, stacked or curved wall passes it.
   b. **Refused, the whole changeset rolled back** (a planner or model fault, not a person's edit): the type is not loaded exactly; its
      family is not wall-hosted; Revit puts the new instance in another wall or none.
   c. Then `doc.Delete(old)`; the deleted ids must be the old instance and annotation only (its tags, its dimensions). Anything else
      (an element hosted on it, a nested shared family's instances, a dependent model element) → the SubTransaction is rolled back and
      the rehost is **kept**: "removing it would also remove N other element(s) (…) — a person decides".
   d. Mark, Comments, Phase Created and the workset are copied from the old instance where writable, after the delete (a Mark copied
      before it would be a duplicate for a moment — a warning the all-or-nothing failure handler could turn into a rollback).
   e. `Collect` reports the NEW instance's UniqueId; the bridge records the removed one (decision 6).
5. **Hinge and swing side:** Promote reads the old instance's HandOrientation and FacingOrientation; along the host wall's direction
   and normal it picks the signs and turns them into `place.Rotation` (degrees) and `place.Mirrored` — `PlacementGeometry.FromAxes`, the
   inverse of `Axes`, pinned by a round-trip check. `TurnToBlocks` (the second transaction) then flips the new instance exactly as for a
   drawn block (its filter takes a rehost too). A hand or facing square to the wall sends no Rotation: the new instance keeps Revit's
   default, and the reason says so.
6. **The ledger names what was removed:** on `changeset_applied` the bridge adds `removed: [{proposal_guid, unique_id, type_before,
   replaced_by}]` for each applied rehost — from the changeset it stored (the target) and the result (the new UniqueId); nothing new is
   read from the add-in. The web desk's "Recently decided" line says "N rehosted (the unhosted instance removed)".
7. **A decline is carried** (MA-3b3): `carryKey` for a rehost = op, kind, target uid, `at` and `Location` to the mm, TypeName, FamilyName.
8. **Words:** Revit's row — `rehost: <Family : Type> at (x, y) → <Family2 : Type2> in the wall at (x, y); the unhosted instance is
   removed (one Undo brings it back)`; the desk's row the same; the review window's "No ghost to draw" names rehost; `LodState` "no wall
   hosts it — Promote proposes a rehost when one wall passes within half its thickness; else a person decides".

## Design review (wf_b8d0b3a1-f9d, 4 lenses, 21 findings verified, 19 stand) — the decisions as revised

The review stands on 3 criticals and 16 importants; each revision below names its finding. **These replace decisions 1-8 where they
differ.**

- **R1 (critical: a delete guard cannot read deleted elements).** Before anything is created: the old instance's Mark, Comments, phases and
  workset are read into locals; a **probe** — `doc.Delete(old)` inside a SubTransaction, its ids classified by category, then rolled back —
  gives exactly what the delete would take. Allowed: the old instance and its **tags** (IndependentTag) only. A dimension, any model element,
  a null or uncategorised id → the rehost is **kept** ("removing it would also remove N other element(s) (…) — a person decides"), nothing
  created. The real delete then must return the probed set, else rolled back and kept. The tags removed are counted on the applied entry
  (`removed_tags`), the row's words, the ledger's `removed`. Promote holds a placeholder a dimension references (plan time).
- **R2 (a level-based instance's Host is its Level).** One predicate, `PlacementGeometry.NoWallHost`: Host null, a Level, a ReferencePlane
  or a SketchPlane → unhosted. OtherFact sets `Unhosted`, never `HostCategory`, for those. A real non-wall host (a roof, a face) keeps v1's hold.
- **R3 (height, critical).** The placeholder's offset from its level (its own offset parameter, else LocationPoint.Z − the level's
  ProjectElevation) and its type's Height decide: a door must stand on its level (|offset| ≤ 0.5 mm, else held "stands N mm above L"); a
  window carries the offset as `SillHeight`; the host wall must contain the opening's span (its base and top relative to the level). The
  row names the level and the sill.
- **R4 (opening centre; the wall body).** The opening's middle is the symbol geometry's (solids) X-midpoint in the family's frame mapped
  through the instance transform (an origin at a jamb is common); `target.at` stays the LocationPoint (the stale guard). Candidate walls
  are found in Revit, by the wall BODY: the point between the wall's two side faces and within its length (a wall drawn on a face has its
  location line off its middle). The pure planner then decides among the candidates (`FindHost`: one straight basic wall, the span, the
  end clearance, group/option).
- **R5 (own type).** No "own type kept": the type is always Swap's resolution (D16), run before the settled/office checks for an unhosted
  instance. `RehostRefusal(doc, sym)` (OneLevelBasedHosted, FAMILY_HOSTING_BEHAVIOR null or wall — GhostChangesetBuild's test) holds it at
  plan and refuses it at Apply.
- **R6 (hinge and swing).** Decision 5 is dropped: a box placeholder has no hinge or swing, and families disagree on what facing means. The
  new instance takes the office family's default along its wall; the row says "hinge and swing: the office family's default — compare with
  the placeholder".
- **R7 (design option).** The executor's option refusal covers `rehost` (it creates): the changeset stays proposed.
- **R8 (editability; commit-time failures).** The old instance and the host wall are checked before anything: pinned, in a group, in a
  design option, borrowed by another user, or changed/deleted in central (App.NotFixableHere's test) → kept. A changeset with a rehost that
  Revit rolls back at commit is returned NotRun (it stays proposed; the words name the rehosts), never declined for good.
- **R9 (an opening already in the wall).** Before the create: the host's inserts (FindInserts) whose along-wall span (and, for a window, its
  sill-to-head span) overlaps the new one → kept "door/window N already stands in wall W across that point — the placeholder may be a
  leftover; a person decides". Two rehosts into one wall meet the same check, one after the other.
- **R10 (kept is not a decline).** A kept ghost (rehost or reshape) is reported rejected **without** a per-ghost reason; its reason goes in
  the result's note, so the bridge counts it unsaid and never carries it as a binding decline (drill MA5b C-3 needed a lead's re-open). The
  dialog and note word kept rows by op.
- **R11 (signed out).** Promote proposes no rehost signed out (held: "a rehost removes an element — sign in and run Promote again"); Review
  AI Proposals refuses to apply a ticked rehost under the machine credential; the bridge refuses a rehost filed, or reported applied, by the
  machine credential (backstops).
- **R12 (the bridge contract).** A rehost branch of its own: type_before and `at` required and kept on the target, the place fields
  checked as a point kind's (LevelName, Location, FamilyName, TypeName, SillHeight on a window only), Mark/Flip*/Rotation refused, never
  typed; one rehost per element and no other op on that element.
- **R13 (pins).** The workset and phase copy go through `PlacementApply.CopyFrom` (PlacementBlock's rule: only PlacementApply writes
  them); the rehost block runs after the rooms and before the retypes (Ma5b4's slice stays).
- **R14 (drill, critical).** ma4c-drill has no lod_matrix — Promote would read walls only. P-0 installs the v0 DD matrix on the drill
  project; the drill runs in a small scratch model (one storey, two or three DD walls, `BDS_INT_1 PNL` loaded), not all of ma5a.rvt; S-0
  first records what Revit says of the placeholder (Host, FamilyPlacementType, which Width/Height parameters it has).

## Files

Bridge — `changesets-logic.mjs` (OPS, OP_KINDS.rehost, TARGET_KEPT `at`, the rehost rules, carryKey), `changesets-store.mjs` (the
`removed` list on the ledger row), `mcp-server.mjs` (the tool description: rehost is a member's, from Promote), tests
`changesets-logic.test.mjs`, `changesets-store.test.mjs`, `changesets-review.test.mjs`.
Add-in — `GhostBuilder/PromotePlanner.cs` (ElementFact: Unhosted, AtMm, hand/facing, SillMm; `FindHost`; `Plan1` → `Rehost`; the
ghost's fields), `GhostBuilder/PromoteWallsPlanner.cs` (PromoteGhost fields, `Bodies` element shape), `Commands.PromoteWalls.cs`
(`OtherFact` reads the unhosted instance; the preflight refuses a rehost the executor would), `GhostBuilder/PlacementGeometry.cs`
(`FromAxes`), `GhostBuilder/ChangesetExecutor.cs` (the rehost block, `RehostRefusal`, the TurnToBlocks filter),
`Coordination/ChangesetClient.cs` (TargetDto.At, ChangesetTrust.PreTick, RehostWords), `UI/ChangesetReviewWindow.cs` (the row),
`GhostBuilder/GhostOverlayGeometry.cs` (words), `GhostBuilder/LodState.cs` (words).
Web — `review-desk.ts` (row, recently decided). Checks — promote-check `Ma5b5.cs` (FindHost cases, FromAxes round trip, planner →
ghost → body, PreTick false, executor wiring pins); pins updated in `Classes.cs`, `LodStateChecks.cs`, `Ma3c.cs`.

## Review focus

1. A delete that takes more than the old instance (hosted children, nested shared families) — kept, never cascaded.
2. A non-hosted family outside Doors/Windows (a Generic Model "door") — out of scope; Promote reads Doors and Windows only.
3. A wall the changeset itself creates as the host (a mixed changeset): the order of the blocks.
4. Undo/redo of a changeset that rehosted: the old instance returns, the reverted report names the proposal; the provenance stamp.
5. A door whose old instance carries a Mark — the copy must not raise a duplicate-Mark warning that the failure handler turns into a
   rollback.

## Live drill MA5b5 (Revit 2024, a scratch copy of `ma5a.rvt`)

| Row | What happens | Pass when |
|---|---|---|
| S-0 | A non-hosted Doors family made in the Family Editor (Metric Generic Model → category Doors, Width 1000 / Height 2100 type parameters, a box), loaded, two instances placed: one standing in an interior wall, one in open floor | two doors, Host none |
| P-1 | Promote (DD) | the first: a `rehost` ghost to the office's 1000 x 2100 interior door in that wall; the second held "no wall … passes within half its thickness" |
| R-1 | Review AI Proposals: the rehost row, unticked (never pre-ticked), its words | as decision 8 |
| R-2 | Tick → Apply | the office door hosted in the wall at the point, hinge and swing as the placeholder's; the placeholder gone; `changeset_applied` with `removed` naming its UniqueId |
| R-3 | Ctrl+Z | the placeholder back, the hosted door gone; `changeset_reverted` |
| R-4 | Redo; pin a third placeholder standing in a wall; Promote; Apply | its rehost kept "pinned"; the rest applied |
