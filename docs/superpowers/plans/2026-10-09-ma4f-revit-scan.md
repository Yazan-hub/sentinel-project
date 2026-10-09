# MA-4f — Revit and the scan: Revit pre-ticks a measured survey create, re-reads each survey wall it placed for verify (`reference: "revit (claimed)"`), and draws the job's scan, decimated, beside the ghosts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sixth slice of MA-4 (design `docs/strategy/2026-09-30-model-automation-design.md` ▸ MA-4, :1146-1152; the MA-4e plan's Next, `docs/superpowers/plans/2026-10-09-ma4e-deviation.md:1312`; the MA-4d plan's open question 2, `docs/superpowers/plans/2026-10-08-ma4d-survey-to-changesets.md:1642`). Shipped as **two sub-slices, each merged, deployed to Revit 2021–2027 and drilled on its own; 4f-1 first.**

- **MA-4f-1 — Revit's pre-tick and Revit's re-read.** Review AI Proposals opens a create **ticked** when a bridge-run survey job measured it — the changeset is not a claim (`claimed: false`), the bridge pre-ticked it, its accuracy is `within_tolerance` — and the office IDS did not reject it; every other create still opens unticked. At Apply, after the commit and the recount, the add-in reads each wall a survey changeset created back from Revit (its main solid, `ClashManager.GetMainSolid` + `Face.Triangulate`) and sends it on Revit's result as `AppliedEntry.mesh`. The bridge never keeps the mesh and never refuses a result over it: it keeps its sha256 and the wall's two side faces (`reread`) — only from a signed-in person's report, and only when the faces lie within the bridge's own bounds of the filed wall; else it says `why` and that wall is measured as filed. `verify` then measures each wall by Revit's re-read when there is one — `reference: "revit (claimed)"`, the add-in's claim, said on the row (`claimed: true`), its action line and the desk — else as filed (MA-4e). The body stays `{changeset}`; the replay key gains the reference.
- **MA-4f-2 — the scan overlay.** In the review window of a survey changeset, **Show the scan** draws the job's own scan in Revit's 3D views, plans and sections as cyan crosses: sentinel-survey re-reads the job's cloud from its anchored row (`POST /cloud`), keeps the changeset's walls' height less 300 mm at the floor and the ceiling, one point per 100 mm cube (the cube doubled until at most 5 000 are left); the bridge moves the points into the model's frame by the lead's frame (`GET /changesets/:key/:id/scan`, a signed-in contributor's read: no row). The overlay stays after Apply (the placed walls against the scan) and goes when unticked or the window closes. The cloud never goes into the model.

**Architecture:**
- 4f-1 add-in: `ChangesetTrust.PreTick` (one line for creates); `AppliedEntry.Mesh` (`[JsonIgnore(WhenWritingNull)]`); `PlacementGeometry.PackMesh` (pure); `ChangesetExecutor.Execute` reads each survey wall after the recount (`WallMesh`).
- 4f-1 bridge: `survey-plan.mjs` — `readMesh`, `meshFaces` (bounded by the filed wall), `REVIT`, `FILED`, `MAX_MESH_TRIANGLES`; `measurePlan` sends a re-read's faces. `changesets-store.mjs` (which already declares its own `FILED`, the filed statuses: survey-plan's is imported `as AS_FILED`) — `reportResult` keeps `reread` (a person's report only); `verifyChangeset` names the reference, marks the row claimed when it rests on a re-read, and compares the reference on a replay.
- 4f-1 web: `review-desk.ts` — the head, a mixed row's lines and the status line name the reference.
- 4f-2 survey: `pipeline.thin`; `service.py` `POST /cloud` (`read_cloud`, a third branch of `run`).
- 4f-2 bridge: `build-jobs.mjs` `measureJob(…, {path, what})`; `survey-plan.mjs` `scanBand`, `cloudRefusal`, `SCAN_*`; `changesets-store.mjs` `jobScan` (MA-4e's chain, lifted) and `scanOverlay`; `bcf-service.mjs` `GET /changesets/:key/:id/scan`; fixture `scan-reply.json`.
- 4f-2 add-in: `ScanDto`, `ChangesetClient.FetchScan`; `GhostOverlayGeometry.ScanCrosses`, `ScanLine`; `GhostOverlayServer` gains a name and cached bounds; the window's **Show the scan**; the wiring in `Commands.ReviewChangesets.cs`.

**Tech Stack:** C# (net48 for Revit 2021–2024, net8/net10 for 2025–2027; System.Text.Json; DirectContext3D), `tools/promote-check` (net8, no Revit API), Node bridge (ESM, vitest, deps injected), TypeScript web (plain DOM, textContent only), Python 3.14 + numpy (`survey/`, `unittest`). No new npm, pip or NuGet dependency; **no migration, no table, no new ledger row type**; the sentinel-survey version stays `0.1.0`.

**Base:** `feature/ma4f-revit-scan` at master `c3aac94` (= `b9f576b` + docs only: drill MA4e passed in full, #2224–#2228; `ma4d.rvt` was closed without saving). Every file:line below was read at `c3aac94`. Drill data: project `ma4c-drill` (office `ma2e-office`), job-0002 (#2201; 47 699 points in, 47 672 after the 20 mm voxel, seed 1), changesets `Survey job-0002 · GR-FFL` (e9130eec…, applied #2210) and `Survey job-0002 · Scan L01 job-0002` (1dc57c2f…, applied #2223), both reported before MA-4f (no re-read: they stay "as filed").

## Global Constraints

- House style: words are sentences; a refusal says what is needed (a write's ends "nothing was saved"; the overlay is a read and says what is not shown); comments name the slice ("MA-4f") and the reason; a `ponytail:` comment on every deliberate simplification names its ceiling and upgrade path; exact words pinned in tests. The web bump (1.0.67, 4f-1 only) is the controller's at the merge.
- Commit messages `feat(addin|bridge|web|survey): MA-4f-1 - …` / `MA-4f-2 - …` or `docs: MA-4f-… - …`, a blank line, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only on `feature/ma4f-revit-scan`; 4f-2 continues on it after 4f-1 merges (fast-forward it to master first).
- Tests: from `WebApp`: `npx vitest run <files>` (never a bare `node bridge/bcf-service.mjs`); from the repo root: `"C:/Python314/python.exe" -B -m unittest discover -s survey -v` (`-B`: no `__pycache__`) and `dotnet run --project tools/promote-check`; **the compile gate** builds 2021–2027 without deploying, whether Revit runs or not — from `SentinelAddin` in PowerShell: `foreach ($v in 2021..2027) { dotnet build .\Sentinel.csproj -c Release -p:RevitVersion=$v -p:DeployToRevit=false; if ($LASTEXITCODE) { "FAILED $v" } }` → no `FAILED` line. **Never `build.ps1` before the merge**: it deploys whenever no `Revit` process runs (`build.ps1:17-26`), which would put the branch's add-in into 2021–2027 before its checks and merge (decision 13); `build.ps1` is D-1's deploy only. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json` if it shows as modified; never stage `WebApp/package-lock.json`. `npm run build` must build; `tsc` is not a gate (17 pre-existing errors; no new one).
- The repo is PUBLIC: fixtures and tests use `example.test`; no real e-mail or user path in a test, fixture or doc (`%APPDATA%\…`, `%USERPROFILE%\…`, never expanded); never print config/.env, WebApp/.npmrc, BCF_TOKEN or ~/.thatopen.
- **The trust rule (binding):** Revit's re-read is **the add-in's claim**. The bridge keeps only its sha256 and the two faces it reduces it to (`reread`, the bridge's reduction of the claim) — and only when a signed-in person filed Revit's report (never the machine credential) and the faces lie within the bridge's own bounds of the filed wall (its line, thickness, base and top); every row and every desk line that rests on it says `revit (claimed)`, and the `verify:measured` row says `claimed: true`; `placed_by` already names who filed Revit's report. A mesh the bridge cannot read, or will not use, is said on the entry (`why`) and that wall is measured as filed — **a result is never refused over a mesh** (a refused result strands Revit's write-once record on the PC: `UnreportedResults.Outcome`). The overlay is the bridge's numbers from the job's anchored row (MA-4e's chain), re-hashed by the service: a signed-in contributor's view, never a row, never a fact anything reads; the points are held in memory and drawn — never written, logged or put in a line.
- **No add-in change ships without its deploy:** each sub-slice is deployed to Revit 2021–2027 with Revit closed (`build.ps1`). Opening and closing Revit is authorised; never discard the founder's unsaved work (check every open document first; a non-drill document with unsaved changes → stop and ask). The "Unsigned Add-In" prompt → **Load Once**.
- net48 builds (2021–2024): no API net48 lacks (`Math.Clamp`, `^1`, `[..]` on arrays, `Enumerable.Chunk`); no Revit API newer than 2021 (`Face.Triangulate`, `Mesh.NumTriangles`, `get_Triangle`, `MeshTriangle.get_Vertex`, `PrimitiveType.LineList`, `IndexLine` exist in every cached Revit API 2021–2027); never `DrawContext.ConvertColorBasedOnTheme` (2027 only).
- **numpy and the standard library only** in `survey/` (the `NoNetwork` test); one process per run (MA-4c decision 3); `/cloud` is a new route on the same lifecycle, token, slot and re-hash.

## Source of truth

- Design (D) at `c3aac94`: rule 3 (:166), rule 6 / MA-4d (:172); stage 5 (:241), stage 7 (:243: "Re-read and LOD state: MISSING (the re-read: MA-4f)"); §4 scans "In Revit: a decimated overlay drawn with DirectContext3D" (:454); §6.6 `changeset_applied` (:840), `verify:measured` (:842); §6.8 `POST /cde/:key/verify` (:893: "`results[]` (Revit's re-read of what it placed) is MA-4f's — posted by the add-in, it would be the client's claim"); §6.9 `GET /jobs/:id/result` with `derived` (:919), `POST /measure` (:920); roles (:959-975, :967 measure, :972 tick and place); MA-4 "A decimated scan overlay in Revit" (:1151); Risks "The cloud never goes into Revit; only a decimated overlay" (:1388).
- MA-4d plan: decision 16 and open question 2 (:1642-1643: Revit keeps scan walls unticked until MA-4f); MA-4e plan: decision 1 (as filed; Revit's re-read is MA-4f's), decision 14 (the pre-tick stays on the fit), Next (:1312).
- Add-in: `SentinelAddin/Coordination/ChangesetClient.cs` — `Pretick` (:116-118), `AccuracyDto` (:202-205), `ChangesetTrust.PreTick` (:214-221), `DeclinedOnWeb` (:267), `ChangesetDto.Claimed` (:479), `AppliedEntry` (:496-501), `ReadHttp`/`WriteHttp` (:507-508), `Send` (:528-534), `FetchOne` (:550-561), `ResultBody` (:573-574, default options); `GhostBuilder/ChangesetExecutor.cs` — `MmToFeet` (:37), `IsCreate` (:383), `t.Commit()` (:703), the recount (:715-724), `TurnToBlocks` (:725), the GHB-1 read after commit (:726-740), `Collect` (:809-819); `GhostBuilder/ChangesetPlacementEvent.cs:126-141` (the executor's `AppliedEntry` objects travel by reference into the record); `Engine/ClashManager.cs:128` (`GetMainSolid`: coarse, largest solid); `Engine/UnreportedResults.cs` — `Record.Applied` (:32), `Root` (:46), `Write`/`Read` (:51-91, default options); `GhostBuilder/PlacementGeometry.cs` (pure, compiled by promote-check); `GhostBuilder/GhostOverlayServer.cs` (all: the constructor ignores `tris` at :27-28; `GetBoundingBox` recomputes `Bounds` per call at :53-57; one `FlushBuffer` per pass, `IndexLine` sized in short ints); `GhostBuilder/GhostOverlayGeometry.cs` (:1-35, :146-160); `UI/ChangesetReviewWindow.cs` — events (:30-38), `_shown` (:57, shared with MA-3c's ghost line), the footer (:131-149), the row's pre-tick (:164), the comment "A create is never pre-ticked" (:278), `Shown` (:376-383); `ChangesetClient.cs` `ElementVerdictDto` (:74-78) and the idiom `e.Verdict?.Status == "rejected"` (`GhostChangesetBuild.cs:715`); `SentinelAddin/build.ps1:17-26` (deploys unless a `Revit` process runs); `Engine/SettingsManager.cs:29` (the model's binding `WebProjectKey` lives in its extensible storage: the unsaved `ma4d.rvt` is not bound — `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:2604`, MA4e R-1 bound it again); `Commands.ReviewChangesets.cs` — `Open` (:333), the ghost overlay (:375-418; `creates`, `outlined` :381, `OverlayOff` :385-390), `DecideRequested` → `Task.Run` (:660); `GhostBuilder/StoreyBatch.cs:101-103` (a batch of one is the changeset itself; survey changesets are never batched).
- promote-check: `tools/promote-check/Check.cs` (`Ok`, `Main`, the call list ending `Sec7HubChecks();`), `PlacementBlock.cs:162` (`Src`), `Trust.cs:28-38, :48-49, :128-131`, `Ma3c.cs:53, :78`, `Ma3b2Reasons.cs:57-74` (the `UnreportedResults.Root` round-trip idiom), `promote-check.csproj` (compiles `ChangesetClient.cs`, `PlacementGeometry.cs`, `GhostOverlayGeometry.cs`, `UnreportedResults.cs`, `UserSession.cs`, `BcfConfig.cs`; never the executor, the server or the window).
- Bridge: `WebApp/bridge/survey-plan.mjs` (:1-24 constants, `r1`, `toModel` :59-63, `toScan` :65-71, the pre-tick :206-216 `pretick: status === "within_tolerance" && s.checked && sized`, `facesOf` :291-302, `measurePlan` :311-326); `changesets-store.mjs` (imports :12-13, its own `const FILED` — the filed statuses — :214 (used :278), `unsaved` :222, `verifyChangeset` :373-489 with `prepare` :444-488 (the job block :450-465), the row :421-433, the reply :441, the replay :479-487; `reportResult` :508-576 with the caller's `role` :515 ("service" for the machine credential), the stored `applied` :549 and the `changeset_applied` row :564-575; the verify row's `claimed: false` :431 and its action line :435); `changesets-logic.mjs:41` (`TRUST_FIELDS`), `:429` (a job's pretick); `build-jobs.mjs` (`writeAtomic` :45, `pickItems` :92-107, `stillAdmitted` :128-136, `readJob` :256-269, `trustedJob` :279-307, `measureJob` :316-325); `survey-service.mjs` (`runSurvey(job, {path})` :49); `bcf-service.mjs` (the verify route :1691-1697, the jobs block :1708-1714, the `/changesets` block :1855-1896, `proposal.frag` :1880-1891); `request-limits.mjs:10` (16 MB JSON on `/changesets`, `BCF_MAX_JSON_MB` overrides); `evidence-logic.mjs:57` (`USES.view_reference` true by default), `:266-268` (a stored item's `allowed_uses` holds every USES key as a boolean); `evidence-store.mjs:318-320` (a survey start: the machine credential is a 403, then the `survey jobs` budget); fixture `fixtures/changeset-ops/contract2-survey.json`; tests `changesets-store.test.mjs:1-40, 149-180, 1075-1200`, `survey-plan.test.mjs:1-20, 170-200`, `build-jobs.test.mjs:249-272`.
- Survey: `survey/service.py` (all); `survey/pipeline.py:38-77` (`load`, `voxel`); `survey/test_survey.py:50-90, 262-268, 445-545`.
- Web: `WebApp/src/setups/review-desk.ts:54-64, 280-340`; `review-desk.test.ts:369-415`.

## Decisions (the founder's defaults; built on unless overruled)

| # | Decision | Default taken here |
|---|---|---|
| 1 | Sub-slices | **Two, 4f-1 first.** 4f-1 (pre-tick + re-read) changes what Revit *writes* — the result body, the record `UnreportedResults` keeps, the stored changeset and its `changeset_applied` row — so it ships alone: an R-row that fails points at one change. 4f-2 (overlay) changes only what Revit *draws* plus a read route and a service route — a larger, independent diff that must not hold 4f-1 back. Each merges, deploys 2021–2027 and drills on its own (one more Revit close: authorised, scripted). 4f-2 can be built while 4f-1's drill runs |
| 2 | Revit's pre-tick, exactly | `ChangesetTrust.PreTick`, in order: a web decline → false (unchanged); **a create (`Op` null or `"create"`) → `cs.Claimed == false && el.Pretick == true && el.Accuracy?.Status == "within_tolerance" && el.Verdict?.Status != "rejected"`**; a `set_parameter` → false (unchanged); a retype or attach → the bridge's `pretick`, else the Promote rule (unchanged). Why both trust fields: the bridge's `pretick` is stricter than the status — within D7's 20 mm **and** the storey's level checked **and** every size measured (`survey-plan.mjs:216`); the status line keeps an older or odd bridge from ticking anything not measured. Both are bridge-only (`TRUST_FIELDS`, `changesets-logic.mjs:41`); `claimed: false` is set only on a changeset built from a job. **Why the IDS clause** (critique): a pre-tick is Sentinel's suggestion, and suggesting what the office's own IDS rejects invites a click-through that Apply's IDS stage then asks to override; Revit-only, in the idiom of `GhostChangesetBuild.cs:715` — the bridge's `pretick` (and MA-4d's web desk and its "N pre-ticked" reply) are unchanged, so Revit ticks the rows the web desk calls pre-ticked **less those whose IDS badge reads ✗ rejected** (open question 1: the bridge-wide variant). **What stays unticked:** every agent, Promote and drawing create (claimed, or null from a bridge before item 8); a survey create the bridge did not pre-tick (a named level not checked — GR-FFL on the drill; one face seen; `out_of_tolerance`, `insufficient_data`); one the office IDS rejected (the drill's survey walls: `✗ rejected (1)`, MA4d — so on `ma4c-drill` only L01's created level opens ticked); a web decline; every type edit. The pre-tick stays **on the fit** (the founder's answer to MA-4d open question 1); a pre-placement deviation per candidate is not built (open question 2). A person still clicks Apply |
| 3 | What Revit re-reads, and when | In `ChangesetExecutor.Execute`, **after `t.Commit()` and the recount** (`:724`, before `TurnToBlocks`): for `cs.Claimed == false` only, each applied entry whose element is a wall create → `a.Mesh = WallMesh(doc.GetElement(a.RevitUniqueId))`, inside `try { … } catch (Exception) { a.Mesh = null; }`. `WallMesh` = every face of `ClashManager.GetMainSolid(e)` (coarse, the largest solid, no transform) through `Face.Triangulate()`, each triangle's three `MeshTriangle.get_Vertex(k)` in **mm, Revit's internal frame** (the frame `Pt()` places in, `:91`; walls carry no transform) → `PlacementGeometry.PackMesh`: rounded to 0.1 mm (never `-0`), **null** for nothing, a part triangle, a non-finite number or more than **64 triangles** (a straight wall after its joins is about 12; past about 50 a solid is curved or swept and fails "one plane" anyway — MA-5). The read is outside any transaction (the commit is over); if the IDS or BLOCK check then rolls the group back, the whole result goes and the mesh with it. Levels, floors, ceilings: no re-read (verify measures walls only, MA-4e decision 2) |
| 4 | The wire shape | `AppliedEntry.Mesh` → `"mesh": [x0,y0,z0, x1,y1,z1, x2,y2,z2, …]` — a flat list, 9 numbers a triangle: the easiest to read in C# and to check in JS. `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]` on the property, so every body and record without one stays **byte-identical** (`ResultBody` and `UnreportedResults` serialize with default options; the property attribute applies there too — `StandardsPack.cs:73` precedent). A record kept on the PC keeps its mesh, so a report sent again later carries it. Winding is not trusted (the bridge reads normals both ways); faces are not grouped (the bridge needs only the two side planes). **The body's size:** 64 triangles × 9 numbers × at most ~10 bytes (`-12345.6,`) ≈ 6 KB a wall; a changeset's 200 elements ≈ 1.2 MB — far inside the 16 MB `jsonCap`, and inside a `BCF_MAX_JSON_MB` lowered to 2 (a 413 would be kept by `UnreportedResults.Outcome` and retried without landing) |
| 5 | What the bridge keeps | In `reportResult`, on a changeset with a `job` and a wall entry with a `mesh`: `reread = {mesh_sha256, faces}`, or `{mesh_sha256, why}` — when the caller is the machine credential (`role === "service"`: "reported with the machine credential — sign in in Revit to have it measured"; MA-4e refuses the machine credential a measure, so the geometry a person's measure uses never comes from an unnamed local process), when it is not a mesh (`readMesh`: 1–64 triangles of 9 numbers within 1e9 mm), or when `meshFaces` cannot reduce it or finds it outside the filed wall's bounds (decision 6). One `why` for all: each leads to the same outcome, measured as filed. `mesh_sha256` is the sha256 of **the bridge's serialization** (`JSON.stringify`) of the numbers it read — not of Revit's bytes (PackMesh never writes `-0`, so they usually agree; nothing compares them). The mesh is not kept (the doc is listed to every desk; 18 numbers of faces are). The entry is rebuilt by the bridge field by field, so a posted `reread` is dropped (pinned in (f)); it rides on the `changeset_applied` row as it is (`applied: updated.result.applied`). A mesh on a claimed changeset, or on a non-wall entry, is ignored (as today). **Never a 400**: a mesh the bridge cannot read or will not use is said and the result lands (a refused result would strand the PC's record, decision 4's reason). An add-in before MA-4f sends none; a bridge before MA-4f drops it (`:549` rebuilds three fields) — either order of deploy is safe |
| 6 | The reduction (`meshFaces`) | The service measures rectangles only (`read_measure`, `pipeline.deviation`), and a new service version would fail every job measured so far (verify fails a measure whose version is not the job's, `changesets-store.mjs:397-400`). So **the bridge reduces the mesh to facesOf's two rectangles** and the service is unchanged: of the triangles whose unit normal is square to the filed line's left normal (\|n̂·p\| ≥ 0.99 — an end, the top and the base are left out), split at the middle of their offsets from the line, each side's bounding rectangle along the line and up, **when it is one plane** (its offsets within 1 mm; else `why`: "a sweep, a reveal or a turn"), corners in facesOf's order (out of the wall), in the **model's** frame (verify moves them into the scan's). It sees the type's real width, the location line and Revit's joins (each side's own ends). **Bounded by the bridge's own facts** (critique: else the claim, not the bridge, picks what is measured — a mesh could put both planes metres off, 50 m long or across storeys): each side's offset within `1.5 × thickness_mm` of the filed line (half the thickness plus one: the location line and the type's real width), its ends within `thickness_mm + 100` of the filed ends (Revit's joins), its height within 100 mm of the filed base and top; past any → `why: "Revit's re-read is N mm off its filed wall — measured as filed"`. ponytail: a bounding rectangle per side — an opening is drawn over; no survey wall has one before MA-5 |
| 7 | How verify uses it | **Automatically, per wall** (`measurePlan`): a wall whose applied entry holds `reread.faces` is sent by them, `reference: "revit (claimed)"` and `mesh_sha256` on its element; else by `facesOf`, `reference: "as filed"`. The row's `reference` is `"revit (claimed)"`, `"as filed"` or `"mixed"`; the reply carries it. **The row says the claim** (critique): `claimed: reference !== "as filed"` (the house flag for "rests on a client's word": `lodStateRow`, `typeGapRow`), and the action line gains ` · revit (claimed)` or ` · mixed: revit (claimed) and as filed` after the status — so the ledger's one line never reads as a certified measure. The body stays `{changeset}` (a choice field would add a UI and a replay input for nothing; MA-4e's body check stands). One run, one reference per wall — never both at once (`deviation` gives each point to the nearest face of every element sent: as-filed and Revit faces would steal each other's points). **Replay key** (MA-4e decision 11) gains `&& (pv.reference ?? AS_FILED) === reference`: a re-read equal to the as-filed faces to 0.1 mm (an unjoined centerline wall of the type's width) gives the same `faces_sha256`, and without the clause the first Revit-referenced row would be refused against an as-filed one. (`changesets-store.mjs:214` already declares `FILED`, the filed statuses: survey-plan's `FILED` is imported `as AS_FILED`.) **Correction to the scope line:** the re-read is Revit's **at Apply** — it shows Revit's joins, the location line and the type's real width; **a wall moved after Apply is not seen** (that needs a re-read on demand: open question 3, Next). The desk never claims it |
| 8 | What the desk says (4f-1) | Head: `revit (claimed)` → "Measured against the scan as Revit placed it (Revit's re-read at Apply, the add-in's claim: its joins, its location line and the type's width in Revit are measured — a wall moved since Apply and the lead's frame are not seen)"; `mixed` → "… as Revit placed it where Revit re-read it at Apply (the add-in's claim), else as filed — …"; `as filed` unchanged. On a mixed row each as-filed wall's line ends "· as filed". Status line: "✓ Measured … against the scan as Revit re-read it (the add-in's claim) — …" (mixed: "as Revit re-read it (the add-in's claim), else as filed"). Revit says nothing new about the pre-tick: the row already shows its accuracy ("within tolerance"), its IDS badge and whether it is ticked |
| 9 | The overlay's cloud (4f-2) | **sentinel-survey makes it, on demand** (`POST /cloud`), from the job's own cloud: the same items, order, params and seed as its `build:run` row (`pipeline.load`, as a measure), so the overlay is the cloud the candidates came from. Not at job time: a job has no frame (the lead states it at Propose), job-0002's applied changesets have no derived file, and points in `result.json` would reach every member through `readJob` and slow every `trustedJob` parse; `derived` stays `[]` (design :919 is job-time files). **Cut** to the changeset's walls' height less **300 mm** at the floor and the ceiling (`scanBand`: no floor or ceiling carpet over a plan; the survey's own wall slice is mid-storey ±300 mm); **thinned** to one point per **100 mm** cube, the cube doubled until at most **5 000** are left (spatially even, never a cut list; deterministic). **Whole mm**: the scan frame can be national-grid sized. The **bridge** maps the z band into the scan's frame (`toScan`), and the answer into the model's (`toModel`, per changeset — one job is one frame); the service stays frame-free. JSON, not float32 (5 000 × 3 integers ≈ 100 KB; read by `System.Text.Json`, pinned by one shared fixture). The service version stays `0.1.0` (a new route; the read is unchanged — MA-4e's `/measure` precedent) and is not checked against the job's (a view; a measure's version check is MA-4e's) |
| 10 | The overlay's route, roles and checks | `GET /changesets/:key/:id/scan` → 200 `{changeset, job, ledger_id, version, cell_mm, z_mm, of, points}` — keyed on the changeset (it holds the job and the frame; the review window holds its id). **A signed-in contributor** (critique: like every other sentinel-survey run — a survey job, a measure — design :964, :966): the machine credential is a 403 in words before anything is read ("sign in (in Revit: Standards ▸ Sign in)"), then `requireMinRole(key, "contributor")`. A viewer cannot Apply, so a viewer's tick buys little and would spend the shared `survey jobs` bucket (per minute, shared with survey starts `evidence-store.mjs:320` and measures `changesets-store.mjs:387`) and hold the one slot against the people doing survey work; refusing the machine credential also keeps a local loop off the slot. **Any status** (most useful while reviewing). The evidence chain is MA-4e's, lifted into `jobScan`: `trustedJob`, the row the changeset was built from, its params and seed, `stillAdmitted`, `pickItems` — plus each read item's `allowed_uses.view_reference`, **failing closed** like `pickItems` (`!== true`; a stored item always holds the key, `evidence-logic.mjs:266-268`; MA-4a's default is true): an owner's "no viewing" is honoured. This is the first route that sends scan-derived points off the PC (over the Funnel to members' Revit; the pack's policy is `redistribute: false`): the points are a view held in memory and drawn — never written, logged or put in a line. The run takes the bridge's one survey slot (`measureJob(…, {path: "/cloud", what: "a scan overlay"})`: a 409 in words while a survey job or a measure runs) and the survey jobs' budget (`takeWriteBudget("survey jobs", {perUser: 6, all: 12})`). Its refusals say what is not shown: one that comes from the shared chain, the budget or the slot ends "…; nothing was saved" there, and is re-worded to "… — its scan is not shown". **No row, no doc, no file** — a view nothing reads as fact. ponytail: no cache — each tick reads the scan again (seconds on the drill); a cache keyed on (the row, the evidence shas, the frame, the cut) when Kladno's read is slow (MA-4h) |
| 11 | The overlay's draw (4f-2) | **Crosses, not points**: DirectContext3D has no point size, so a `PointList` dot is one pixel and vanishes on a high-DPI screen; each point is three 60 mm arms (`LineList`), **cyan** (0, 160, 220 — none of the ghosts' green, grey or red). **Budget 5 000 points** = 30 000 vertices in one buffer: inside any 16-bit index width (Revit sizes its index buffers in short ints), so no chunking; the add-in also draws at most its budget whatever arrives. A **second `GhostOverlayServer`** (crosses are plain segments — no new server class), named "Scan overlay" in the Doctor's lines; its bounds computed once a geometry (not each frame). (The constructor still drops its `tris` — harmless, since the ghost's `Update` runs before `Register` and the scan passes none: left for a later slice.) **Toggle**: a "Show the scan" tick in the review window's footer, shown only on a survey changeset (`Claimed == false`), **off by default** (each tick is a run on the survey slot); not a ribbon button (no changeset context there; "Scan Now" already exists). **Views**: the ghost's `CanExecute` (3D, plans, sections of this document) — plans read right because the bridge cuts to one storey's walls; whether a section box or a plan's view range clips DC3D is observed in the drill, not coded. **Lifetime**: stays after Apply; removed when unticked or the window closes; the newest tick wins (an answer to an older tick is dropped). `scanOn` is read and written **on Revit's thread only**: the removal is a hub job too, so an untick that lands while the draw job runs removes what it drew (hub jobs run one at a time, in order). Unticking puts MA-3c's ghost line back (`Line(creates, outlined)`; the two share `_shown`). Fetched off Revit's thread (`Task.Run`) with the 120 s client (`WriteHttp`: the bridge runs the service), drawn through the hub on the model in front (`App.Events.Enqueue(doc, …)`, DocPin) |
| 12 | promote-check | New `tools/promote-check/Ma4f.cs` (the MA-4e plan's Next called it `Ma4e.cs`; the slice that adds the pins names it): `Ma4fChecks()` (4f-1) and `Ma4f2Checks()` (4f-2), called after `Sec7HubChecks();`. **Changed on purpose:** `Trust.cs:37-38` flips to `ChangesetTrust.PreTick(sv, e)` (the drill fixture's three survey walls now open ticked) with its words and the comment at :28-30; `Trust.cs:48-49`'s words ("not from any source" → "from a claimed source"); `Ma3c.cs:53` (`"Ghost overlay: drawn in"` → `"{_name}: drawn in"`) and `Ma3c.cs:78` (Register and Remove counted 2 and 2: the ghost's and the scan's); two comments that would contradict the new rule — `ChangesetReviewWindow.cs:278` ("A create is never pre-ticked") and the `ChangesetDto.Claimed` doc comment |
| 13 | Deploy | Per sub-slice, after its machine checks and its merge: Revit closed (check open documents first), `SentinelAddin\build.ps1` builds and deploys 2021–2027 (it skips the deploy while Revit runs; before the merge only the compile gate's `-p:DeployToRevit=false` loop runs, Global Constraints); the R-rows then run on Revit 2024 against the 4100 bridge restarted on master — **MA-4d's order** (Revit rows after the merge): the add-in's config points at 4100 on loopback and is not changed. Why merge-first is safe here: every new path falls back to MA-4e's behaviour (no mesh or an unreadable one → as filed; an old bridge drops the mesh; the overlay is off until ticked; Revit's pre-tick ticks only what the web desk already pre-ticks, less what the office IDS rejected; a person still clicks Apply). Revit 2025–2027 get the deploy only (as MA-3c; a MA3cR-style run is optional) |
| 14 | MCP | No tool: `sentinel_changeset_status` is unchanged; the overlay is Revit's |

## Scope

In (4f-1): `ChangesetTrust.PreTick`'s create line; `AppliedEntry.Mesh`; `PlacementGeometry.PackMesh`; the executor's re-read; `readMesh`, `meshFaces`, `measurePlan`'s reference; `reportResult`'s `reread`; `verifyChangeset`'s reference, claimed flag, action line, reply and replay key; the desk's words; promote-check pins; the design rows; deploy; drill MA4f-1.
In (4f-2): `pipeline.thin`; `POST /cloud`; `measureJob`'s path; `jobScan`; `scanBand`, `cloudRefusal`; `scanOverlay` and its route; `ScanDto`, `FetchScan`, `ScanCrosses`, `ScanLine`; the server's name and bounds; the window's tick and its wiring; pins; the design rows; deploy; drill MA4f-2.

Out (see Next): a re-read on demand after Apply (a wall moved since); a pre-placement deviation per candidate at job time; the IDS verdict in the bridge's pretick (web and Revit together: open question 1); a cache, a 202 or a job-time derived cloud for the overlay; chunked overlay buffers past 5 000 points; an RCP link (ReCap only, design :454); the scan in the web desk (MA-4i); faces with openings in the re-read (MA-5); floors, ceilings and levels re-read or measured (MA-4h); a computed frame (MA-4g).

## Interfaces

```text
MA-4f-1
Revit's pre-tick (ChangesetTrust.PreTick, pure)
  declined on the web → false; create → cs.Claimed == false && el.Pretick == true && el.Accuracy?.Status == "within_tolerance"
                                         && el.Verdict?.Status != "rejected";
  set_parameter → false; retype / attach → el.Pretick ?? the Promote rule (unchanged)

Revit's result (POST /changesets/:key/:id/result — the route and its other fields unchanged)
  applied: [{proposal_guid, revit_element_id, revit_unique_id, mesh?}]
    mesh: [x0,y0,z0, x1,y1,z1, x2,y2,z2, …] — mm, Revit's internal frame, 0.1 mm (never -0), 1 to 64 triangles; only on a wall a changeset
          with claimed false created; the key is absent otherwise (never null on the wire)

The bridge keeps (changeset doc result.applied[i], and the changeset_applied row's applied[i]) — built by the bridge, a posted reread dropped
  reread: {mesh_sha256, faces: [left [p0,p1,p3], right [p0,p1,p3]] (model mm)}
        | {mesh_sha256, why}   (the machine credential's report; not a mesh; not one plane a side; outside the filed wall's bounds:
                                measured as filed)

survey-plan  REVIT = "revit (claimed)", FILED = "as filed", MAX_MESH_TRIANGLES = 64
             readMesh(m) → null | what is wrong;  meshFaces(el, m) → {faces} | {why}   (model frame; bounded by el's line, thickness, base, top)
             measurePlan(cs, undone) → placed[i] gains reference (and mesh_sha256 for a re-read) when its faces are sent
changesets-store  imports survey-plan's FILED as AS_FILED (its own FILED, :214, is the filed statuses)

verify (POST /cde/:key/verify {changeset} — unchanged body)
  row new_value: reference "revit (claimed)" | "as filed" | "mixed"; claimed: reference !== "as filed";
                 elements[i].reference, elements[i].mesh_sha256 (re-read only)
  row action: verify:measured <job> · sentinel-survey <v> · <status>[ · revit (claimed) | · mixed: revit (claimed) and as filed][ · <counts>]
  reply: {changeset, status, reference, counts, elements, ledger}
  replay (409): … && (newest.reference ?? AS_FILED) === reference

MA-4f-2
sentinel-survey (the same process lifecycle, token, slot and re-hash)
  POST /cloud {job_id: "scan-<changeset id>", items, params: {voxel_mm, storey_min_mm}, seed,
               cloud: {cell_mm: 100, z_mm: [low, high] (the scan's frame), max_points: 5000 (8 to 100 000)}} → 202 {job_id, status: "queued"}
  GET /jobs/:id → {status, stage, pct, refused, error?};  every item sent must be read again, or refused
  GET /jobs/:id/result → {points: [[x, y, z] whole mm, the scan's frame], derived: [],
                          receipt: {tools, params, seed, started, finished, cpu_s, points_in, points_used,
                                    cloud: {cell_mm (the cube used), z_mm, of (kept at the first cube), points}, units}}

Bridge
  GET /changesets/:key/:id/scan → 200 {changeset: {id, name}, job, ledger_id, version, cell_mm, z_mm: [low, high] (model mm), of,
                                       points: [[x, y, z] whole mm, Revit's internal frame]}
     a signed-in contributor; refusals, each saying what is not shown: 403 the machine credential / below contributor; 404 no changeset;
     409 not a survey changeset / no wall / the job's chain (MA-4e's words, re-worded "— its scan is not shown") / a scan whose allowed uses
     do not include viewing; 429; 503 not set up; 409 busy; 409 the scan not read again; 502 the run failed / not the contract's shape
  build-jobs   measureJob(key, jobId, payload, deps?, {path = "/measure", what = "a measure"}?)
  survey-plan  SCAN_CELL_MM = 100, SCAN_MAX = 5000, SCAN_MARGIN_MM = 300; scanBand(cs) → [low, high] | null; cloudRefusal(res, cap) → null | what
  changesets-store  scanOverlay(key, id, deps?); jobScan(key, cs, {trustedJob, readPack}) → {row, evidence, items, pack} (module-private)

Add-in
  ScanDto {Job, LedgerId, CellMm, ZMm, Of, Points};  ChangesetClient.FetchScan(cfg, key, id, out error) → ScanDto | null (120 s)
  GhostOverlayGeometry.ScanBudget = 5000, ScanCrossMm = 60, ScanColour (0, 160, 220), ScanCrosses(points, budget), ScanLine(scan, drawn)
  GhostOverlayServer(doc, title, segments, tris = null, name = "Ghost overlay")
  ChangesetReviewWindow.ScanRequested (Action<bool>)
```

## File map

| File | Change |
|---|---|
| **4f-1** | |
| `WebApp/bridge/survey-plan.mjs` (after `facesOf` :302; `measurePlan` :311-326) | `REVIT`, `FILED`, `MAX_MESH_TRIANGLES`, `readMesh`, `meshFaces`; `measurePlan` |
| `WebApp/bridge/fixtures/box-mesh.mjs` (new) | `boxMesh` for tests |
| `WebApp/bridge/survey-plan.test.mjs` (:9 imports; a new describe at the end) | Task 1 tests |
| `WebApp/bridge/changesets-store.mjs` (:12 imports; :421-441; :480-488; :549; a helper before `reportResult`) | `reread`, the reference, the claimed flag and action line, the replay key |
| `WebApp/bridge/changesets-store.test.mjs` (:6-7 imports; (a) :1127-1128; new (f), (g) in the verify describe) | Task 2 tests |
| `WebApp/bridge/bcf-service.mjs` (:1691-1693) | the verify route's comment |
| `WebApp/src/setups/review-desk.ts` (:54-64, :314-340), `review-desk.test.ts` (in "measured against the scan (MA-4e)") | Task 3 |
| `SentinelAddin/Coordination/ChangesetClient.cs` (:116-117, :210-221, :477-478 `Claimed`'s doc, :496-501) | the pre-tick, `Mesh` |
| `SentinelAddin/GhostBuilder/PlacementGeometry.cs` (after `BodyReach` :62) | `MaxMeshTriangles`, `PackMesh` |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (after :383; after :724) | `WallMesh`; the re-read |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` (:164, :278 comments) | words |
| `tools/promote-check/Trust.cs` (:28-30, :37-38, :48-49), `Ma4f.cs` (new), `Check.cs` (after `Sec7HubChecks();`) | pins |
| `docs/strategy/2026-09-30-model-automation-design.md` | Task 5 |
| **4f-2** | |
| `survey/pipeline.py` (after `voxel` :77), `survey/service.py` (:28-29, `run` :74-109, after `read_measure` :176, `do_POST` :226-233), `survey/test_survey.py` (after `Voxel` :268; in `InProcess`) | `thin`, `/cloud` |
| `WebApp/bridge/build-jobs.mjs` (`measureJob` :316-325), `build-jobs.test.mjs` (in "stillAdmitted and measureJob") | `{path, what}` |
| `WebApp/bridge/survey-plan.mjs` (the end), `survey-plan.test.mjs` | `SCAN_*`, `scanBand`, `cloudRefusal` |
| `WebApp/bridge/changesets-store.mjs` (`prepare` :450-465 → `jobScan`; a new export after `verifyChangeset`), `changesets-store.test.mjs` ((h), (i)) | `jobScan`, `scanOverlay` |
| `WebApp/bridge/fixtures/changeset-ops/scan-reply.json` (new) | the reply both sides read |
| `WebApp/bridge/bcf-service.mjs` (before :1892 `if (p2 && !p3 && req.method === "GET")`) | the route |
| `SentinelAddin/Coordination/ChangesetClient.cs` (after `FetchOne`; a DTO after `AppliedEntry`) | `ScanDto`, `FetchScan` |
| `SentinelAddin/GhostBuilder/GhostOverlayGeometry.cs` (usings; after `Line` :160) | `Scan*` |
| `SentinelAddin/GhostBuilder/GhostOverlayServer.cs` (:17-35, :45-57, :68) | name, bounds |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` (:36; :146) | `ScanRequested`, the tick |
| `SentinelAddin/Commands.ReviewChangesets.cs` (after :418) | the wiring |
| `tools/promote-check/Ma4f.cs` (`Ma4f2Checks`), `Ma3c.cs` (:53, :78), `Check.cs` | pins |
| `docs/strategy/2026-09-30-model-automation-design.md` | Task 10 |

---

# MA-4f-1 — Revit's pre-tick and Revit's re-read

### Task 0 — Commit this plan (the controller, before Task 1)

- [ ] `git add docs/superpowers/plans/2026-10-09-ma4f-revit-scan.md` and commit `docs: MA-4f - the plan (Revit's pre-tick, Revit's re-read, the scan overlay)` on `feature/ma4f-revit-scan`, so Task 6's `git status` and commit count read clean. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` (`git checkout --`; its diff today is line endings only).

### Task 1 — Bridge, the pure half: a re-read read and reduced; `measurePlan` names the reference

**Files:** create `WebApp/bridge/fixtures/box-mesh.mjs`; modify `WebApp/bridge/survey-plan.mjs`, `WebApp/bridge/survey-plan.test.mjs`.

- [ ] **Step 1: the test helper** — `WebApp/bridge/fixtures/box-mesh.mjs`:

```js
// MA-4f (tests only): a wall's solid as Revit's re-read sends it — a box around the line [ax, ay] → [bx, by], t thick from z0 to z1, as 12
// triangles of 9 numbers each (mm, the model's frame), the winding as it falls. Its quads: 0 the left side (+n), 1 the end at b, 2 the right
// side (−n), 3 the end at a, 4 the base, 5 the top — 18 numbers each.
export const boxMesh = ([ax, ay], [bx, by], t, z0, z1) => {
  const L = Math.hypot(bx - ax, by - ay), nx = (-(by - ay) / L) * (t / 2), ny = ((bx - ax) / L) * (t / 2);
  const c = (i) => [...[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]][i % 4], i < 4 ? z0 : z1];
  return [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [0, 3, 2, 1], [4, 5, 6, 7]]
    .flatMap(([a, b, d, e]) => [...c(a), ...c(b), ...c(d), ...c(a), ...c(d), ...c(e)]);
};
```

- [ ] **Step 2: the failing tests** — in `survey-plan.test.mjs`, extend the import at :9 with `readMesh, meshFaces, REVIT, FILED`, add `import { boxMesh } from "./fixtures/box-mesh.mjs";`, and append:

```js
describe("MA-4f — Revit's re-read of a placed wall: read, then the two faces sentinel-survey measures", () => {
  const W = { kind: "wall", place: { LocationCurve: { start: [40125, 150, 0], end: [47850, 150, 0] }, TopElevation: 2800 }, facts: { thickness_mm: 300 } };
  const T = { ...W, place: { ...W.place, LocationCurve: { start: [47850, 150, 0], end: [47850, 5900, 0] } } };
  const I = toScan(ZERO); // facesOf in the model's own frame
  const box = boxMesh([40125, 150], [47850, 150], 300, 0, 2800);
  const flip = (m) => Array.from({ length: m.length / 9 }, (_, i) => [...m.slice(9 * i, 9 * i + 3), ...m.slice(9 * i + 6, 9 * i + 9), ...m.slice(9 * i + 3, 9 * i + 6)]).flat();

  it("readMesh: 1 to 64 triangles of 9 finite numbers within 1e9 mm — else what is wrong, in words", () => {
    expect(readMesh(box)).toBeNull();
    expect([readMesh([]), readMesh([1, 2, 3]), readMesh("x"), readMesh(Array(9 * 65).fill(1)), readMesh([1, 2, 3, NaN, 5, 6, 7, 8, 9]), readMesh([0, 0, 2e9, 0, 0, 0, 0, 0, 0])])
      .toEqual(["not a list of triangles (9 numbers each)", "not a list of triangles (9 numbers each)", "not a list of triangles (9 numbers each)",
        "65 triangles — over the 64 a wall's re-read holds", "number 3 is not a coordinate in mm", "number 2 is not a coordinate in mm"]);
  });
  it("meshFaces: a box on the filed line is facesOf's two faces, whatever its winding and its line's direction; a wider type moves each face out by half the difference", () => {
    expect(meshFaces(W, box)).toEqual(facesOf(W, I));
    expect(meshFaces(W, flip(box))).toEqual(facesOf(W, I));
    expect(meshFaces(T, boxMesh([47850, 150], [47850, 5900], 300, 0, 2800))).toEqual(facesOf(T, I));
    expect(meshFaces(W, boxMesh([40125, 150], [47850, 150], 350, 0, 2800)).faces.map((f) => f[0][1])).toEqual([325, -25]);
  });
  it("meshFaces: each side keeps its own ends (Revit's joins); a solid it cannot reduce says why", () => {
    // the left face runs 150 mm past each end (an outside corner), the right one stops 150 mm short (an inside corner)
    const joined = [...boxMesh([39975, 150], [48000, 150], 300, 0, 2800).slice(0, 18), ...boxMesh([40275, 150], [47700, 150], 300, 0, 2800).slice(36, 54)];
    expect(meshFaces(W, joined)).toEqual({ faces: [[[39975, 300, 0], [39975, 300, 2800], [48000, 300, 0]], [[40275, 0, 0], [47700, 0, 0], [40275, 0, 2800]]] });
    expect(meshFaces(W, box.slice(90))).toEqual({ why: "Revit's solid has no face along its filed line" });   // the top only
    expect(meshFaces(W, box.slice(0, 18))).toEqual({ why: "Revit's solid has one side along its filed line" }); // the left side only
    expect(meshFaces(W, [...boxMesh([40125, 150], [47850, 150], 300, 0, 1400), ...boxMesh([40125, 150], [47850, 150], 400, 1400, 2800)]))
      .toEqual({ why: "its left side is not one plane (50 mm deep: a sweep, a reveal or a turn)" });
    expect(meshFaces({ ...W, place: {} }, box)).toEqual({ why: "its line, measured thickness or top is not on the changeset" });
    expect(meshFaces({ ...W, facts: {} }, box)).toEqual({ why: "its line, measured thickness or top is not on the changeset" });
  });
  it("meshFaces: the claim is held to the filed wall — a solid off its line, past its ends or off its height is measured as filed", () => {
    // 2 000 mm off the line: both side planes are parallel to it and one plane each, so only the bound refuses them (offsets 2 150 and 1 850, the bound 450)
    expect(meshFaces(W, boxMesh([40125, 2150], [47850, 2150], 300, 0, 2800))).toEqual({ why: "Revit's re-read is 1700 mm off its filed wall — measured as filed" });
    expect(meshFaces(W, boxMesh([40125, 150], [97850, 150], 300, 0, 2800))).toEqual({ why: "Revit's re-read is 49600 mm off its filed wall — measured as filed" }); // 50 m on
    expect(meshFaces(W, boxMesh([40125, 150], [47850, 150], 300, 3000, 5800))).toEqual({ why: "Revit's re-read is 2900 mm off its filed wall — measured as filed" }); // a storey up
    // the bounds' own edges are kept: the location line at a finish face (each side 0 and 300 off) and joins a thickness and 100 mm past each end
    expect(meshFaces(W, boxMesh([40125, 300], [47850, 300], 300, 0, 2800)).faces).toBeDefined();
    expect(meshFaces(W, boxMesh([39725, 150], [48250, 150], 300, -100, 2900)).faces).toBeDefined();
  });
  it("measurePlan: a wall Revit re-read is sent by its re-read, in the scan's frame, and says so; one without — or one the bridge could not reduce — as filed", () => {
    const S = toScan(EAST);
    const rr = { mesh_sha256: "a".repeat(64), ...meshFaces(W, boxMesh([40125, 150], [47850, 150], 350, 0, 2800)) };
    const cs = { job: { frame: EAST }, elements: ["a", "b", "c"].map((g) => ({ ...W, proposal_guid: g })),
      result: { applied: [{ proposal_guid: "a", revit_unique_id: "U-a", reread: rr }, { proposal_guid: "b", revit_unique_id: "U-b" },
        { proposal_guid: "c", revit_unique_id: "U-c", reread: { mesh_sha256: "b".repeat(64), why: "Revit's solid has one side along its filed line" } }] } };
    const p = measurePlan(cs);
    expect(p.send).toEqual([{ guid: "a", faces: [[[125, 325, 0], [125, 325, 2800], [7850, 325, 0]], [[125, -25, 0], [7850, -25, 0], [125, -25, 2800]]] },
      { guid: "b", faces: facesOf(W, S).faces }, { guid: "c", faces: facesOf(W, S).faces }]);
    expect(p.placed.map((x) => [x.reference, x.mesh_sha256 ?? null])).toEqual([[REVIT, "a".repeat(64)], [FILED, null], [FILED, null]]);
  });
});
```

- [ ] **Step 3: run** — `cd WebApp && npx vitest run bridge/survey-plan.test.mjs` → the new describe fails (`readMesh` is not exported).
- [ ] **Step 4: the code** — in `survey-plan.mjs`, after `facesOf` (:302):

```js
/** MA-4f: what a placed wall was measured by — Revit's re-read at Apply (the add-in's claim, said so) or the changeset's own geometry. */
export const REVIT = "revit (claimed)", FILED = "as filed";
/** MA-4f: the most triangles a wall's re-read may hold — a straight wall after its joins is about 12; past about 50 a solid is curved or swept
 *  and fails "one plane" anyway (MA-5). The add-in sends none past it (PlacementGeometry.MaxMeshTriangles); 200 walls of 64 are ~1.2 MB of body. */
export const MAX_MESH_TRIANGLES = 64;

/** MA-4f: null when `m` is a re-read the bridge can read — 1 to MAX_MESH_TRIANGLES triangles, 9 finite numbers each (x, y, z of three corners,
 *  mm, Revit's internal frame), each within 1e9 mm — else what is wrong, in words. Pure. */
export function readMesh(m) {
  if (!Array.isArray(m) || !m.length || m.length % 9) return "not a list of triangles (9 numbers each)";
  if (m.length / 9 > MAX_MESH_TRIANGLES) return `${m.length / 9} triangles — over the ${MAX_MESH_TRIANGLES} a wall's re-read holds`;
  for (let i = 0; i < m.length; i++) if (!Number.isFinite(m[i]) || Math.abs(m[i]) > 1e9) return `number ${i} is not a coordinate in mm`;
  return null;
}

/** MA-4f: Revit's re-read of a placed wall (readMesh's triangles) as the two faces sentinel-survey measures — facesOf's shape and order, in the
 *  MODEL's frame (verify moves them into the scan's): of the triangles whose unit normal is square to the filed line's left normal (|n̂·p| ≥ 0.99;
 *  the winding is not trusted; an end, the top and the base are left out), split at the middle of their offsets from the line, each side's
 *  bounding rectangle along the line and up — when it is one plane (its offsets within 1 mm). It sees the type's real width, the location line
 *  and each side's own ends (Revit's joins). The claim is held to the bridge's own facts of the filed wall (its line, measured thickness, base
 *  and top): past them it is not this wall as filed, and the wall is measured as filed. → {faces} or {why}. Pure.
 *  ponytail: a bounding rectangle per side — an opening is drawn over; no survey wall has one before MA-5. */
export function meshFaces(el, m) {
  const c = el.place?.LocationCurve, t = el.facts?.thickness_mm, zt = el.place?.TopElevation;
  if (!Array.isArray(c?.start) || !Array.isArray(c?.end) || !Number.isFinite(c.start[2]) || !(t > 0) || !Number.isFinite(zt))
    return { why: "its line, measured thickness or top is not on the changeset" }; // facesOf's words
  const [ax, ay, zb] = c.start, L = Math.hypot(c.end[0] - ax, c.end[1] - ay);
  if (!(L >= 1)) return { why: "its filed line is shorter than 1 mm" };
  const ux = (c.end[0] - ax) / L, uy = (c.end[1] - ay) / L, px = -uy, py = ux; // p: the line's left, facesOf's n
  const at = [];
  for (let i = 0; i < m.length; i += 9) {
    const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = m.slice(i, i + 9);
    const e = [x1 - x0, y1 - y0, z1 - z0], f = [x2 - x0, y2 - y0, z2 - z0];
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]], len = Math.hypot(...n);
    if (!(len > 0) || Math.abs(n[0] * px + n[1] * py) / len < 0.99) continue;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y1, z1], [x2, y2, z2]]) at.push({ o: (x - ax) * px + (y - ay) * py, u: (x - ax) * ux + (y - ay) * uy, z });
  }
  if (!at.length) return { why: "Revit's solid has no face along its filed line" };
  const lo = Math.min(...at.map((q) => q.o)), hi = Math.max(...at.map((q) => q.o)), mid = (lo + hi) / 2;
  if (hi - lo < 1) return { why: "Revit's solid has one side along its filed line" };
  const box = (qs, side) => {
    const o = qs.map((q) => q.o), deep = Math.max(...o) - Math.min(...o);
    if (deep > 1) return { why: `its ${side} side is not one plane (${Math.round(deep)} mm deep: a sweep, a reveal or a turn)` };
    const us = qs.map((q) => q.u), zs = qs.map((q) => q.z);
    return { off: o.reduce((s, v) => s + v, 0) / o.length, u0: Math.min(...us), u1: Math.max(...us), z0: Math.min(...zs), z1: Math.max(...zs) };
  };
  const l = box(at.filter((q) => q.o > mid), "left"), r = box(at.filter((q) => q.o <= mid), "right");
  if (l.why) return l;
  if (r.why) return r;
  // MA-4f (critique): the bounds — each side within half the thickness and one more thickness of the filed line (the location line, the type's
  // real width), its ends within a thickness and 100 mm of the filed ends (Revit's joins), its height within 100 mm of the filed base and top.
  const past = Math.max(...[l, r].flatMap((b) => [Math.abs(b.off) - 1.5 * t, -(t + 100) - b.u0, b.u1 - (L + t + 100), zb - 100 - b.z0, b.z1 - (zt + 100)]));
  if (past > 0) return { why: `Revit's re-read is ${Math.round(past)} mm off its filed wall — measured as filed` };
  const pt = (b, u, z) => [r1(ax + ux * u + px * b.off), r1(ay + uy * u + py * b.off), r1(z)];
  return { faces: [
    [pt(l, l.u0, l.z0), pt(l, l.u0, l.z1), pt(l, l.u1, l.z0)],    // facesOf's left face, out to the left
    [pt(r, r.u0, r.z0), pt(r, r.u1, r.z0), pt(r, r.u0, r.z1)]] }; // its right face, out to the right
}
```

  and replace the body of `measurePlan` (:311-326), keeping its doc comment and adding one line to it (`MA-4f: a wall Revit re-read at Apply is sent by its re-read's faces (reference REVIT, its mesh's sha), else as filed (FILED); placed[i].reference is set only when its faces are sent.`):

```js
export function measurePlan(cs, undone = () => null) {
  const S = toScan(cs.job.frame), send = [], skip = [], placed = [];
  for (const a of cs.result?.applied ?? []) {
    const el = (cs.elements ?? []).find((e) => e.proposal_guid === a.proposal_guid), u = undone(a.proposal_guid);
    const rr = el?.kind === "wall" ? a.reread : null;
    const f = u != null ? { why: `undone in Revit (ledger #${u}) — nothing placed to measure` }
      : rr?.faces ? { faces: rr.faces.map((q) => q.map(([x, y, z]) => [...S.xy([x, y]), S.z(z)])), reference: REVIT, mesh_sha256: rr.mesh_sha256 }
      : el?.kind === "wall" ? { ...facesOf(el, S), reference: FILED }
      : el?.kind === "level" ? { why: "a level has no face to measure — its height against the scan is MA-4h's level error" }
      : el?.kind === "floor" || el?.kind === "ceiling" ? { why: `one face of a ${el.kind} is seen; its other is its type's, which no scan measured, and the slab beyond would count against it — MA-4h` }
      : { why: el ? `a ${el.kind} is not measured by sentinel-survey 0.1` : "not on the changeset" };
    placed.push({ proposal_guid: a.proposal_guid, revit_unique_id: a.revit_unique_id ?? null, cid: el?.cid ?? null, kind: el?.kind ?? null,
      ...(f.faces ? { reference: f.reference, ...(f.mesh_sha256 ? { mesh_sha256: f.mesh_sha256 } : {}) } : {}) });
    if (f.faces) send.push({ guid: a.proposal_guid, faces: f.faces }); else skip.push({ proposal_guid: a.proposal_guid, reason: f.why });
  }
  return { send, skip, placed };
}
```

- [ ] **Step 5: run** — `npx vitest run bridge/survey-plan.test.mjs` → all pass (the MA-4e `measurePlan` test maps four fields of `placed`: unchanged).
- [ ] **Step 6: commit** — `feat(bridge): MA-4f-1 - Revit's re-read read and reduced to the two faces sentinel-survey measures; measurePlan names the reference`

### Task 2 — Bridge, the store: Revit's result keeps the re-read; verify names the reference

**Files:** modify `WebApp/bridge/changesets-store.mjs`, `WebApp/bridge/changesets-store.test.mjs`, `WebApp/bridge/bcf-service.mjs` (a comment).

- [ ] **Step 1: the failing tests** — in `changesets-store.test.mjs` add `import { meshFaces } from "./survey-plan.mjs";` and `import { boxMesh } from "./fixtures/box-mesh.mjs";`. In the verify describe, test (a) (:1127-1128) gains the reference: `expect(v.elements[0]).toEqual({ proposal_guid: "g1", revit_unique_id: "u1", cid: "scan-L00-wall-1", kind: "wall", reference: "as filed", status: "within_tolerance", basis: "deviation", ...NUMS() });` and `expect(r).toEqual({ changeset: { id: ID, name: "Survey job-0002 · GR-FFL" }, status: "done", reference: "as filed", counts: v.counts, elements: v.elements, ledger: { id: 2300, hash: "ab".repeat(32) } });`. Then add, at the end of the verify describe:

```js
  // MA-4f: the drill's three walls as Revit's re-read sends them — a box around each filed line (the model's frame).
  const LINES = [[[40125, 150], [47850, 150]], [[40125, 5900], [47850, 5900]], [[47850, 150], [47850, 5900]]];
  const sha = (m) => createHash("sha256").update(JSON.stringify(m)).digest("hex");
  const kept = (i, t) => { const m = boxMesh(...LINES[i], t, 0, 2800); return { mesh_sha256: sha(m), ...meshFaces(CS.elements[i], m) }; };
  const withReread = (ts) => ({ ...CS, result: { ...CS.result, applied: CS.result.applied.map((a, i) => (ts[i] ? { ...a, reread: kept(i, ts[i]) } : a)) } });
  const COUNTS3 = "3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured";

  it("(f) MA-4f: Revit's result keeps each placed survey wall's re-read — its sha and two side faces, never the mesh; a mesh it cannot read is said and the result lands; a posted reread is dropped; the machine credential's mesh and a claimed changeset's are not used", async () => {
    const person = { myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor") }; // Revit signed in (H4)
    const deps = baseDeps(person);
    deps.saved.set(ID, { ...CS, status: "proposed", result: undefined });
    const W1 = boxMesh(...LINES[0], 300, 0, 2800);
    const out = await reportResult("ma4c-drill", ID, { applied: [
      { proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", mesh: W1 },
      { proposal_guid: "g2", revit_element_id: 902, revit_unique_id: "u2", mesh: [1, 2, 3] },
      { proposal_guid: "g3", revit_element_id: 903, revit_unique_id: "u3", reread: { mesh_sha256: "f".repeat(64), faces: [] } }], rejected: [] }, "r", deps);
    expect(out.status).toBe("applied");
    expect(out.result.applied).toEqual([
      { proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", reread: { mesh_sha256: sha(W1),
        faces: [[[40125, 300, 0], [40125, 300, 2800], [47850, 300, 0]], [[40125, 0, 0], [47850, 0, 0], [40125, 0, 2800]]] } },
      { proposal_guid: "g2", revit_element_id: 902, revit_unique_id: "u2", reread: { mesh_sha256: sha([1, 2, 3]), why: "not a list of triangles (9 numbers each)" } },
      { proposal_guid: "g3", revit_element_id: 903, revit_unique_id: "u3" }]); // the bridge rebuilds each entry: a posted reread is never kept
    expect(deps.audit.mock.calls.find((c) => c[3] === "changeset_applied")[6].applied).toEqual(out.result.applied);
    const machine = baseDeps({ myRole: vi.fn(async () => "service"), requireMinRole: vi.fn(async () => "service") });
    machine.saved.set(ID, { ...CS, status: "proposed", result: undefined });
    const o1 = await reportResult("ma4c-drill", ID, { applied: [{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", mesh: W1 }], rejected: ["g2", "g3"] }, "r", machine);
    expect(o1.result.applied).toEqual([{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1",
      reread: { mesh_sha256: sha(W1), why: "reported with the machine credential — sign in in Revit to have it measured" } }]);
    const own = baseDeps(person);
    own.saved.set(ID, { ...CS, job: undefined, claimed: true, status: "proposed", result: undefined });
    const o2 = await reportResult("ma4c-drill", ID, { applied: [{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1", mesh: W1 }], rejected: ["g2", "g3"] }, "r", own);
    expect(o2.result.applied).toEqual([{ proposal_guid: "g1", revit_element_id: 901, revit_unique_id: "u1" }]);
  });
  it("(g) MA-4f: walls Revit re-read are measured by the re-read — the row (claimed), its action line, the reply and each element say revit (claimed) and name the mesh's sha; a mix says mixed; the same faces under an as-filed row are measured again (the reference changed)", async () => {
    const filed = vdeps();
    await verify(filed);
    const FILED_SENT = filed.measureJob.mock.calls[0][2].elements;
    const RR = withReread([350, 200, 300]); // the first wall's type is 50 mm wider in Revit than its measured thickness
    const deps = vdeps({}, RR);
    const r = await verify(deps);
    const v = deps.audit.mock.calls[0][6];
    expect(deps.measureJob.mock.calls[0][2].elements).toEqual([{ guid: "g1", faces: [[[125, 325, 0], [125, 325, 2800], [7850, 325, 0]], [[125, -25, 0], [7850, -25, 0], [125, -25, 2800]]] }, ...FILED_SENT.slice(1)]);
    expect([v.reference, v.claimed, r.reference, v.elements.map((e) => [e.reference, e.mesh_sha256])])
      .toEqual(["revit (claimed)", true, "revit (claimed)", RR.result.applied.map((a) => ["revit (claimed)", a.reread.mesh_sha256])]);
    expect(deps.audit.mock.calls[0][3]).toBe(`verify:measured job-0002 · sentinel-survey 0.1.0 · done · revit (claimed) · ${COUNTS3}`);
    const mix = vdeps({}, withReread([300, 200, null]));
    await verify(mix);
    expect([mix.audit.mock.calls[0][6].reference, mix.audit.mock.calls[0][6].claimed, mix.audit.mock.calls[0][6].elements.map((e) => e.reference), mix.audit.mock.calls[0][3]])
      .toEqual(["mixed", true, ["revit (claimed)", "revit (claimed)", "as filed"], `verify:measured job-0002 · sentinel-survey 0.1.0 · done · mixed: revit (claimed) and as filed · ${COUNTS3}`]);
    const done = await firstRow(); // a done row measured as filed
    const same = vdeps({ listAudit: audits(ROWS, [done]) }, withReread([300, 200, 300]));
    await verify(same);
    expect([same.measureJob.mock.calls[0][2].elements, same.audit.mock.calls[0][6].faces_sha256, same.audit.mock.calls[0][6].reference])
      .toEqual([FILED_SENT, done.new_value.faces_sha256, "revit (claimed)"]);
  });
```

- [ ] **Step 2: run** — `cd WebApp && npx vitest run bridge/changesets-store.test.mjs` → (a), (f), (g) fail.
- [ ] **Step 3: the code** — in `changesets-store.mjs`:
  - :12 import gains `readMesh, meshFaces, REVIT, FILED as AS_FILED` — **`as AS_FILED`**: the module already declares `const FILED` (:214, the filed statuses, MA-4d decision 19, read at :278); importing the bare name is a SyntaxError that would stop every `/changesets` and `/cde/:key/verify` route loading, and comparing against the array would make a row with no `reference` never a replay.
  - Before `reportResult` (:508) add:

```js
/** MA-4f: what the bridge keeps of Revit's re-read of a placed survey wall — the add-in's claim: the sha256 of the bridge's serialization of
 *  it and the two faces meshFaces reduces it to (model frame, bounded by the filed wall); or why not — the machine credential's report (MA-4e
 *  refuses it a measure, so its geometry is not used for a person's either), not a mesh, or not reducible. Never the mesh itself (the doc is
 *  listed to every desk), never a refusal (a result is Revit's write-once record of what it placed: verify measures that wall as filed). */
const reread = (m, el, role) => {
  const mesh_sha256 = createHash("sha256").update(JSON.stringify(m)).digest("hex");
  if (role === "service") return { mesh_sha256, why: "reported with the machine credential — sign in in Revit to have it measured" };
  const bad = readMesh(m);
  return bad ? { mesh_sha256, why: bad } : { mesh_sha256, ...meshFaces(el, m) };
};
```

  - :549 becomes (`role` is the bridge's reading of the caller, :515):

```js
        applied: appliedArr.map((a) => {
          const el = cs.elements.find((e) => e.proposal_guid === a.proposal_guid);
          // Built field by field: a posted reread is never kept. MA-4f: Revit's re-read of a wall a survey changeset placed (a claimed
          // changeset's mesh is ignored, as before MA-4f).
          return { proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null,
            ...(cs.job && el?.kind === "wall" && a.mesh != null ? { reread: reread(a.mesh, el, role) } : {}) };
        }),
```

  - In `prepare` (after `const faces = …` at :479) add `const refs = [...new Set(plan.placed.map((y) => y.reference).filter(Boolean))], reference = refs.length === 1 ? refs[0] : "mixed";`, extend the replay condition (:485) with `&& (pv.reference ?? AS_FILED) === reference`, and return `reference` with the rest (`return { proj, cs, row, evidence, items, applied, reverted, faces, plan, reference };`). The destructuring at :390 gains `reference`.
  - The row (:429): `reference: "as filed",` → `reference,` and its comment → `// MA-4f: Revit's re-read where the add-in sent one the bridge could reduce ("revit (claimed)"), else as filed, or "mixed"; the frame is the lead's statement.` In the same value (:431) `claimed: false` → `claimed: reference !== AS_FILED` with the comment `// MA-4f: a measure that rests on Revit's re-read rests on the add-in's word`.
  - The action line (:435) — the ledger's one line says the claim too:

```js
    written = await d.audit(proj.id, "changeset", cs.id, `verify:measured ${cs.job.id} · ${READER} ${r.version ?? "(no version)"} · ${status}` +
      `${reference === AS_FILED ? "" : reference === REVIT ? ` · ${REVIT}` : ` · mixed: ${REVIT} and ${AS_FILED}`}${status === "done" ? ` · ${countWords(counts)}` : ""}`,
      actor || "web", null, value);
```
  - The reply (:441): `return { changeset: { id: cs.id, name: cs.name }, status, reference, counts, elements, ledger };`
  - The doc comment of `verifyChangeset`: replace the two lines from `"As filed" is the founder's answer…` to `…its results[] would be the add-in's claim).` with `MA-4f: each wall Revit re-read at Apply (AppliedEntry.mesh → reread) is measured by that re-read, the add-in's claim, said on the row and each element ("revit (claimed)"); the rest as filed (MA-4e, the founder's answer). ponytail: the re-read is Revit's at Apply — a wall moved after it, a model closed unsaved and a wrong frame are not seen; a re-read on demand is Next.`
  - `bcf-service.mjs:1691-1693`: `(no results[]: the bridge measures; a Revit re-read is MA-4f's)` → `(no results[]: the bridge measures; Revit's re-read rides on Revit's result since MA-4f)`.
- [ ] **Step 4: run** — `npx vitest run bridge/changesets-store.test.mjs bridge/survey-plan.test.mjs` → all pass.
- [ ] **Step 5: commit** — `feat(bridge): MA-4f-1 - Revit's result keeps each survey wall's re-read (sha and two faces, bounded by the filed wall, a person's report only; never a refusal); verify measures by it and says revit (claimed), the replay key compares the reference`

### Task 3 — Web: the desk says which geometry was measured

**Files:** modify `WebApp/src/setups/review-desk.ts`, `WebApp/src/setups/review-desk.test.ts`.

- [ ] **Step 1: the failing test** — in the describe "measured against the scan (MA-4e)" add:

```ts
  it("MA-4f: a measure of Revit's re-read says so — the head, a mixed row's as-filed lines, the status line", () => {
    const cs = { id: A, name: "Survey job-0003 · Scan L01 job-0003", source: "sentinel-survey 0.1.0", status: "applied", created_at: "", elements: [W] } as PendingChangeset;
    const rec: VerifyRecord = { id: 2400, at: "2026-10-10T10:00:00Z", actor: "lead@example.test", status: "done", reference: "revit (claimed)", target_mm: 20,
      placed_by: { reported_by: "lead@example.test", reported_role: "lead" }, counts: { within_tolerance: 1 }, elements: [{ ...IN, reference: "revit (claimed)" }] };
    expect(verifiedView(cs, rec)!.head).toBe("Measured against the scan as Revit placed it (Revit's re-read at Apply, the add-in's claim: its joins, its location line and the type's width in Revit are measured — a wall moved since Apply and the lead's frame are not seen) · placed as Revit reported (by lead@example.test) · 1 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2400 · 2026-10-10 10:00 UTC · by lead@example.test");
    const mix = verifiedView(cs, { ...rec, reference: "mixed", elements: [{ ...IN, reference: "revit (claimed)" }, { ...IN, proposal_guid: "g9", reference: "as filed" }] })!;
    expect(mix.head).toContain("Measured against the scan as Revit placed it where Revit re-read it at Apply (the add-in's claim), else as filed — a wall moved since Apply and the lead's frame are not seen · ");
    expect(mix.lines.map((l) => l.words.endsWith(" · as filed"))).toEqual([false, true]);
    const reply = { changeset: { id: A, name: cs.name }, status: "done", counts: { within_tolerance: 3 }, elements: [], ledger: { id: 2400, hash: "h" } };
    expect([measureLine({ ...reply, reference: "revit (claimed)" }), measureLine({ ...reply, reference: "mixed" })]).toEqual([
      "✓ Measured Survey job-0003 · Scan L01 job-0003 against the scan as Revit re-read it (the add-in's claim) — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2400",
      "✓ Measured Survey job-0003 · Scan L01 job-0003 against the scan as Revit re-read it (the add-in's claim), else as filed — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2400"]);
  });
```

- [ ] **Step 2: run** — `cd WebApp && npx vitest run src/setups/review-desk.test.ts` → fails.
- [ ] **Step 3: the code** — `Measured` (:54-57) gains `reference?: string;`; `MeasureReply` (:64) gains `reference?: string;` after `status`. Before `verifiedView` add:

```ts
/** MA-4f: what the head says each reference measured — as filed (the changeset's geometry), Revit's re-read at Apply (the add-in's claim), or a
 *  mix. Never "a wall moved since Apply": Revit re-reads at Apply. */
const MEASURED_AS: Record<string, string> = {
  "as filed": " as filed (the changeset's geometry, which Revit placed exactly — not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen)",
  "revit (claimed)": " as Revit placed it (Revit's re-read at Apply, the add-in's claim: its joins, its location line and the type's width in Revit are measured — a wall moved since Apply and the lead's frame are not seen)",
  mixed: " as Revit placed it where Revit re-read it at Apply (the add-in's claim), else as filed — a wall moved since Apply and the lead's frame are not seen",
};
```

  In `verifiedView`: :319 becomes `const filed = MEASURED_AS[rec.reference ?? ""] ?? "";` and the lines map's `words:` becomes `measureWords(m, rec.target_mm) + (rec.reference === "mixed" && m.reference === "as filed" ? " · as filed" : "")`. :340 becomes:

```ts
export const measureLine = (r: MeasureReply): string =>
  `✓ Measured ${r.changeset.name} against the scan ${r.reference === "revit (claimed)" ? "as Revit re-read it (the add-in's claim)" : r.reference === "mixed" ? "as Revit re-read it (the add-in's claim), else as filed" : "as filed"} — ${countWords(r.counts)} · ${rowWords(r)}`;
```

- [ ] **Step 4: run** — the file passes (MA-4e's pinned "as filed" words unchanged); `npm run build` builds.
- [ ] **Step 5: commit** — `feat(web): MA-4f-1 - the desk says when a measure is of Revit's re-read (the add-in's claim) or a mix`

### Task 4 — Add-in: the pre-tick, the re-read, the pins

**Files:** modify `SentinelAddin/Coordination/ChangesetClient.cs`, `SentinelAddin/GhostBuilder/PlacementGeometry.cs`, `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, `SentinelAddin/UI/ChangesetReviewWindow.cs`, `tools/promote-check/Trust.cs`, `tools/promote-check/Check.cs`; create `tools/promote-check/Ma4f.cs`.

- [ ] **Step 1: the failing pins** — `tools/promote-check/Ma4f.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-4f-1: Revit's pre-tick of a measured survey create; Revit's re-read of each survey wall it placed (AppliedEntry.mesh) ──
    static void Ma4fChecks()
    {
        Console.WriteLine("\nMA-4f — Revit's pre-tick of a measured survey create; Revit's re-read (AppliedEntry.mesh)");
        string survey;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-survey.json"))))
            survey = fx.RootElement.GetProperty("stored").GetRawText();
        bool Ticked(Action<ChangesetDto, ChangesetElementDto> edit) { var c = JsonSerializer.Deserialize<ChangesetDto>(survey); edit(c, c.Elements[0]); return ChangesetTrust.PreTick(c, c.Elements[0]); }
        Ok(Ticked((c, e) => { }), "MA-4f: a survey create the bridge pre-ticked within tolerance opens ticked in Revit (the web desk calls it pre-ticked)");
        Ok(!Ticked((c, e) => e.Pretick = false), "…not one the bridge did not pre-tick (a storey whose level was not checked, a size not measured)");
        Ok(!Ticked((c, e) => e.Accuracy.Status = "out_of_tolerance") && !Ticked((c, e) => e.Accuracy = null), "…not one out of tolerance, nor one with no accuracy, whatever its pretick says");
        Ok(!Ticked((c, e) => c.Claimed = null) && !Ticked((c, e) => c.Claimed = true), "…not from a claimed source, nor from a bridge before item 8");
        Ok(!Ticked((c, e) => e.Verdict = new ElementVerdictDto { Status = "rejected" }) && Ticked((c, e) => e.Verdict = new ElementVerdictDto { Status = "accepted" }),
           "…not one the office IDS rejected (its badge reads ✗ rejected; Apply's IDS stage would ask straight after) — an accepted one still opens ticked");
        Ok(!Ticked((c, e) => e.Review = new ReviewDto { State = "declined" }), "…not one declined on the web: a decline binds");
        Ok(!Ticked((c, e) => e.Op = "set_parameter"), "…and a type edit never");

        var plain = new AppliedEntry { ProposalGuid = "g1", RevitElementId = 901, RevitUniqueId = "u1" };
        var meshed = new AppliedEntry { ProposalGuid = "g2", RevitElementId = 902, RevitUniqueId = "u2", Mesh = new double[] { 0, 0, 0, 1000, 0, 0, 0, 0, 2800 } };
        string Body(params AppliedEntry[] a) => ChangesetClient.ResultBody(a.ToList(), new List<string>(), null, null, null);
        Ok(!Body(plain).Contains("\"mesh\"") && Body(plain).Contains("\"applied\":[{\"proposal_guid\":\"g1\",\"revit_element_id\":901,\"revit_unique_id\":\"u1\"}]"),
           "an entry with no re-read writes no mesh key: every other result body stays byte-identical");
        Ok(Body(meshed).Contains("\"mesh\":[0,0,0,1000,0,0,0,0,2800]"), "…and a re-read rides on its entry, 9 numbers a triangle");
        var root = Path.Combine(Path.GetTempPath(), "ma4f-check-" + Guid.NewGuid().ToString("N"));
        var was = UnreportedResults.Root;
        UnreportedResults.Root = root;
        try
        {
            UnreportedResults.Write(new UnreportedResults.Record { Key = "ma4f", ChangesetId = "c-1", Name = "Survey job-0003 · Scan L01 job-0003", Doc = "a.rvt", Applied = new List<AppliedEntry> { plain, meshed }, At = "2026-10-10T12:00:00Z" });
            UnreportedResults.Write(new UnreportedResults.Record { Key = "ma4f", ChangesetId = "c-0", Name = "Promote (DD) · GR-FFL", Doc = "a.rvt", Applied = new List<AppliedEntry> { plain }, At = "2026-10-10T12:00:00Z" });
            var back = UnreportedResults.Read("ma4f", "c-1");
            Ok(back.Applied[1].Mesh.SequenceEqual(meshed.Mesh) && back.Applied[0].Mesh == null && Body(back.Applied.ToArray()) == Body(plain, meshed)
               && !File.ReadAllText(UnreportedResults.PathFor("ma4f", "c-0")).Contains("mesh"),
               "a result kept on this PC keeps each re-read, so a report sent again later carries it; a record with none holds no mesh key");
        }
        finally { UnreportedResults.Root = was; try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ } }

        Ok(PlacementGeometry.PackMesh(new List<double> { 0.04, 0, 0, 1000.06, 0, 0, 0, 0, 2799.96 }).SequenceEqual(new double[] { 0, 0, 0, 1000.1, 0, 0, 0, 0, 2800 })
           && JsonSerializer.Serialize(PlacementGeometry.PackMesh(new List<double> { -0.04, 0, 0, 1, 0, 0, 0, 0, 1 })) == "[0,0,0,1,0,0,0,0,1]",
           "PackMesh rounds each corner to 0.1 mm and never writes -0 (the bridge's JSON would not)");
        Ok(PlacementGeometry.PackMesh(new List<double>()) == null && PlacementGeometry.PackMesh(new List<double> { 1, 2, 3 }) == null
           && PlacementGeometry.PackMesh(new List<double> { double.NaN, 0, 0, 1, 0, 0, 0, 0, 1 }) == null
           && PlacementGeometry.PackMesh(Enumerable.Repeat(1.0, 9 * (PlacementGeometry.MaxMeshTriangles + 1)).ToList()) == null
           && PlacementGeometry.PackMesh(Enumerable.Repeat(1.0, 9 * PlacementGeometry.MaxMeshTriangles).ToList()).Length == 9 * 64,
           "…and gives none for nothing, a part triangle, a number not finite, or more than 64 triangles (the bridge then measures the wall as filed)");

        string ex = Src("GhostBuilder", "ChangesetExecutor.cs");
        int at = ex.IndexOf("try { a.Mesh = WallMesh(doc.GetElement(a.RevitUniqueId)); } catch (Exception) { a.Mesh = null; }", StringComparison.Ordinal);
        int recount = ex.IndexOf("GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)", StringComparison.Ordinal);
        Ok(at > ex.IndexOf("var status = t.Commit();", StringComparison.Ordinal) && at > recount && at < ex.IndexOf("TurnToBlocks(doc, cs, toPlace, result);", StringComparison.Ordinal)
           && ex.LastIndexOf("if (cs.Claimed == false)", at, StringComparison.Ordinal) > recount
           && ex.Contains("var s = e == null ? null : ClashManager.GetMainSolid(e);") && ex.Contains("return PlacementGeometry.PackMesh(mm);"),
           "the executor re-reads each wall a survey changeset created after the commit and the recount, from its main solid; a read that throws leaves it null");
        string win = Src("UI", "ChangesetReviewWindow.cs");
        Ok(win.Contains("IsChecked = ChangesetTrust.PreTick(_cs, el), // MA-1a item 8, MA-4f:") && !win.Contains("A create is never pre-ticked"),
           "the window still ticks by ChangesetTrust alone, and no comment there says a create is never pre-ticked");
    }
}
```

  In `Check.cs`, after `Sec7HubChecks();` add `Ma4fChecks();`. In `Trust.cs`: the comment at :30 ends `the bridge's pre-tick is read — and (MA-4f) Revit opens each such create ticked (one the IDS rejected stays unticked).`; :37 `&& !ChangesetTrust.PreTick(sv, e)),` → `&& ChangesetTrust.PreTick(sv, e)),`; :38's words → `"…each wall pre-ticked by the bridge, within tolerance, typed by the bridge — and (MA-4f) opened ticked in Revit: a measured survey create"`; :49's words → `"a create from a claimed source is never pre-ticked — not when a bridge says pretick true, not from an older bridge (MA-4f: only a survey job's)"`.

- [ ] **Step 2: run** — `dotnet run --project tools/promote-check` → it does not compile (`Mesh`, `PackMesh`, `MaxMeshTriangles` missing).
- [ ] **Step 3: the code** —
  - `ChangesetClient.cs:116-117`: `Never trusted for a create (ChangesetTrust.PreTick).` → `Trusted for a create only on a survey changeset (Claimed false) within tolerance and not rejected by the IDS (MA-4f: ChangesetTrust.PreTick).`
  - `ChangesetClient.cs:477-478` (`Claimed`'s doc) gains, before `</summary>`: ` MA-4f: false (a bridge-run survey job) is what lets Revit pre-tick a measured create (ChangesetTrust.PreTick) and re-read the walls it places.`
  - `ChangesetClient.cs` `PreTick` (:210-221) becomes:

```csharp
    /// <summary>What is ticked when the review opens (and by "Tick suggested"). MA-4f: a create is pre-ticked only when a bridge-run survey job
    /// measured it — the changeset is no claim (Claimed false) — the bridge pre-ticked it within tolerance (its pretick also needs the storey's
    /// level checked and every size measured: survey-plan's trust), and the office IDS did not reject it — so Revit ticks what the web desk calls
    /// pre-ticked, less what its IDS badge marks rejected. An agent's, Promote's or a drawing's create — any claimed source, or a bridge before
    /// item 8 — still opens unticked, whatever a bridge answers. A retype or attach takes the bridge's decision; from a bridge before item 8 (no
    /// pretick) the window's own rule holds: a Promote attach, and a Promote retype with the type the plan saw (DR-1). A person still clicks Apply.</summary>
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el)
    {
        // MA-3a (design §6.6, D17): a web decline binds — never ticked, whatever else holds. A web accept changes nothing here (advice).
        if (DeclinedOnWeb(el)) return false;
        // MA-4f: a measured survey create, as the bridge pre-ticked it — never one the office IDS rejected (a suggestion Apply's IDS stage would
        // ask to override straight after; GhostChangesetBuild's idiom).
        if (el.Op is null or "create")
            return cs.Claimed == false && el.Pretick == true && el.Accuracy?.Status == "within_tolerance" && el.Verdict?.Status != "rejected";
        // MA-2c: a set_parameter is a TYPE edit — it reaches every element on the type — so it is never pre-ticked (founder decision F1).
        if (el.Op == "set_parameter") return false;
        return el.Pretick ?? (cs.Source == "promote" && (el.Op == "attach" || (el.Op == "retype" && el.Target?.TypeBefore != null)));
    }
```

  - `AppliedEntry` (:496-501) gains:

```csharp
    /// <summary>MA-4f: Revit's re-read of a wall a survey changeset created (Claimed false) — its main solid's triangles, 9 numbers each (x, y, z
    /// of three corners, mm, Revit's internal frame), read after the commit (ChangesetExecutor). The add-in's claim: the bridge keeps its sha and
    /// two side faces and verify measures by them ("revit (claimed)"). Null — and then left out of every body and record, which stay
    /// byte-identical — for every other entry, and when the read threw or passed PlacementGeometry.MaxMeshTriangles.</summary>
    [JsonPropertyName("mesh")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public double[] Mesh { get; set; }
```

  - `PlacementGeometry.cs`, after `BodyReach` (:62):

```csharp
    /// <summary>MA-4f: the most triangles a wall's re-read holds (the bridge's MAX_MESH_TRIANGLES) — a straight wall after its joins is about 12;
    /// past about 50 it is curved or swept and the bridge would not reduce it (MA-5).</summary>
    public const int MaxMeshTriangles = 64;

    /// <summary>MA-4f: a wall's triangles (9 numbers each, mm) as Revit's result sends them: each rounded to 0.1 mm, never -0; null for none, a
    /// part triangle, a number not finite, or more than MaxMeshTriangles — the bridge then measures the wall as filed.</summary>
    public static double[] PackMesh(IReadOnlyList<double> mm)
    {
        if (mm == null || mm.Count == 0 || mm.Count % 9 != 0 || mm.Count / 9 > MaxMeshTriangles) return null;
        var o = new double[mm.Count];
        for (var i = 0; i < o.Length; i++)
        {
            if (double.IsNaN(mm[i]) || double.IsInfinity(mm[i])) return null;
            o[i] = Math.Round(mm[i] * 10) / 10 + 0.0; // + 0.0: a -0 becomes 0 (System.Text.Json writes "-0")
        }
        return o;
    }
```

  - `ChangesetExecutor.cs`, after `IsCreate` (:383):

```csharp
    /// <summary>MA-4f: a wall as Revit holds it — every face of its main solid (ClashManager.GetMainSolid: coarse, the largest; a wall carries no
    /// transform) as triangles, 9 numbers each in mm in Revit's internal frame (the frame Pt places in); PlacementGeometry.PackMesh rounds and caps
    /// it. Null with no element or no solid.</summary>
    private static double[] WallMesh(Element e)
    {
        var s = e == null ? null : ClashManager.GetMainSolid(e);
        if (s == null) return null;
        var mm = new List<double>();
        foreach (Face f in s.Faces)
        {
            var m = f.Triangulate();
            for (var i = 0; i < m.NumTriangles; i++)
            {
                var t = m.get_Triangle(i);
                for (var k = 0; k < 3; k++) { var p = t.get_Vertex(k); mm.Add(p.X / MmToFeet); mm.Add(p.Y / MmToFeet); mm.Add(p.Z / MmToFeet); }
            }
        }
        return PlacementGeometry.PackMesh(mm);
    }
```

    and after the recount's `foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) result.Warnings[kv.Key] = kv.Value;` (:724):

```csharp
            // MA-4f: Revit's re-read for verify — each wall a survey changeset created (Claimed false: built by a bridge-run job), as Revit holds
            // it after the commit and the recount: its joins, its location line, its type's real width. The add-in's claim, said so by the bridge
            // ("revit (claimed)"). Read only — the transaction is over; a read that throws, or a solid past the cap, leaves Mesh null and the
            // bridge measures that wall as filed.
            if (cs.Claimed == false)
                foreach (var a in result.Applied)
                    if (toPlace.First(e => e.ProposalGuid == a.ProposalGuid) is { Kind: "wall" } w && IsCreate(w))
                        try { a.Mesh = WallMesh(doc.GetElement(a.RevitUniqueId)); } catch (Exception) { a.Mesh = null; }
```

  - `ChangesetReviewWindow.cs:164` comment → `// MA-1a item 8, MA-4f: the bridge's pre-tick — a create only when a survey job measured it and the IDS did not reject it`; `:278` `A create is never pre-ticked; a person still clicks Apply.` → `A create is pre-ticked only when a survey job measured it (MA-4f); a person still clicks Apply.`
- [ ] **Step 4: run** — `dotnet run --project tools/promote-check` → all pass (`n/n checks pass`; record n); the compile gate (Global Constraints: the `-p:DeployToRevit=false` loop over 2021–2027, **not** `build.ps1`, which would deploy the unmerged add-in while Revit is closed) → no `FAILED` line.
- [ ] **Step 5: commit** — `feat(addin): MA-4f-1 - Revit opens a measured survey create ticked (claimed false, the bridge's pretick, within tolerance, not IDS-rejected) and re-reads each survey wall it placed after the commit (AppliedEntry.mesh, null-omitted); pins`

### Task 5 — Docs: the design rows (4f-1)

**Files:** modify `docs/strategy/2026-09-30-model-automation-design.md`.

- [ ] **Step 1:**
  - `:172` (the MA-4d bullet) append: ` MA-4f BUILT: Revit opens such a create ticked — \`ChangesetTrust.PreTick\`: claimed false, the bridge's pretick, \`within_tolerance\`, not rejected by the office IDS — so Revit ticks what the web desk calls pre-ticked, less what the IDS rejected; every claimed create still opens unticked; a person still clicks Apply.`
  - `:243` (stage 7's status) `Re-read and LOD state: MISSING (the re-read: MA-4f)` → `Re-read: BUILT for the walls a survey changeset places (MA-4f: \`AppliedEntry.mesh\` read after the commit, the add-in's claim; the bridge keeps its sha and two faces from a signed-in person's report, bounded by the filed wall, and verify measures by them — \`reference: "revit (claimed)"\`, the row \`claimed: true\`; a wall moved after Apply is not seen). LOD state: MISSING`.
  - `:840` (`changeset_applied`) append: ` MA-4f: a survey wall's entry carries \`reread {mesh_sha256, faces}\` (or \`{mesh_sha256, why}\`: the machine credential's report, not a mesh, not one plane a side, or outside the filed wall's bounds — measured as filed) — Revit's re-read at Apply, the add-in's claim; the mesh is not kept, and a mesh the bridge cannot read or will not use never refuses the result.`
  - `:842` (`verify:measured`) append: ` MA-4f: \`reference\` is \`"revit (claimed)"\` when every measured wall was re-read by Revit at Apply, \`"as filed"\` when none, \`"mixed"\` between; \`claimed\` is true unless it is \`"as filed"\`, and the action line then says \`· revit (claimed)\` or \`· mixed: revit (claimed) and as filed\`; each element names its reference (and its mesh's sha); a replay must match the reference too.`
  - `:893` append: ` MA-4f: still \`{changeset}\` only — Revit's re-read rides on Revit's result (\`AppliedEntry.mesh\`), not on this body; verify measures by it when present.`
- [ ] **Step 2: commit** — `docs: MA-4f-1 - the design: Revit's pre-tick of a measured survey create, Revit's re-read on the result and in verify (revit (claimed))`

### Task 6 — Final checks (nothing to commit)

From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore the fixture if listed), `npm run build 2>&1 | tail -3`, `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). From the repo root: `"C:/Python314/python.exe" -B -m unittest discover -s survey -v` (unchanged, all pass), `dotnet run --project tools/promote-check` (all pass), the compile gate (every version, no deploy), `git diff --name-only master | grep -E "migrations/|^survey/"` → nothing, `git status --short` shows only `.claude/`, `ab.html` and the pre-existing `package-lock.json` (the plan was committed in Task 0; `ids-cases.json` restored if a run rewrote its line endings), `graphify update .`. Report the totals and `git log --oneline master..HEAD` (six commits: the plan's, then Tasks 1–5).

## Live drill MA4f-1 (the controller; the founder's session where marked)

Project `ma4c-drill` (office `ma2e-office`); never `aster-tower`, Demo, a pilot file or a founder file. **MA-4d's order:** the machine checks (Task 6), then the merge, the deploy and the R-rows on Revit 2024 against the 4100 bridge restarted on master (the add-in's config points at 4100 on loopback; no config is changed). Rows marked **[founder]** need the founder's signed-in session (a survey job, a proposal and a measure each name a person; no machine stand-in); R-2's Revit sign-in is the founder's only if Revit's kept session has lapsed.

- **D-0 set-up (read only)** — is Revit running (`tasklist | findstr /i Revit.exe`)? If so, screenshot its open documents: a document with unsaved changes that is not a drill scratch copy → stop and ask; else close Revit. Record the `ma4c-drill` ledger count (Supabase MCP, read only) and `b4100 GET "changesets/ma4c-drill?status=proposed"` → none.
- **D-1 merge, deploy, publish** — merge `feature/ma4f-revit-scan` to master; restart the 4100 bridge on master; with Revit closed, `cd SentinelAddin && powershell -ExecutionPolicy Bypass -File .\build.ps1` → "Installed Revit versions detected: 2021, …, 2027", every version built and deployed (no `FAILED`); the web bump 1.0.67 and publish (before any R-4 measure: a desk at 1.0.66 or earlier says "against the scan as filed" for a `revit (claimed)` measure — its `measureLine` hard-codes it); a secret scan of the range, push.
- **R-1 a fresh survey job and its proposal [founder]** — on the web against 4100: Files ▸ Evidence ▸ Survey → Start on the pack in force → `job-0003` done (its `build:run` row; 47 699 points in, 47 672 used, seed 1 — job-0002's numbers); **Propose…** job-0003, frame 40000 / 0 / 0 / 0, levels `scan-L00-level → GR-FFL` → `✓ Proposed job-0003 — 2 changeset(s), 7 ghost(s), 4 pre-ticked …` (MA-4d's numbers: GR-FFL's three walls not pre-ticked — "its height not checked"; L01's created level and three walls pre-ticked), the overlaps naming job-0002's two placed changesets. Record both changeset ids.
- **R-2 Revit's pre-tick** — open Revit 2024 (Unsigned Add-In → **Load Once**), open `%USERPROFILE%\Documents\Sentinel drills\ma4d.rvt` (the scratch copy as saved: no placements, and **not bound** — the binding lives in the model's extensible storage and was never saved, `SIMULATION_ROOM_RUN_2026-09-22.md:2604`) → **Sentinel ▸ Project Setup → bind `ma4c-drill`** (as MA4e R-1; never saved). **Standards ▸ Sign in** shows a signed-in person (the session survives a Revit restart, `UserSession`); if it says signed out → **[founder]** signs in (a password: never the controller's) — Revit's report must name a person, or the bridge keeps no re-read (decision 5). Record who. Review AI Proposals → the picker lists both (a changeset opens on a **double-click** of its row, `:2606`) → `Survey job-0003 · GR-FFL`: its three walls open **unticked**; close the window (nothing decided: it stays proposed). → `Survey job-0003 · Scan L01 job-0003`: the created level opens **ticked** ("within tolerance", `✓ accepted`); the three walls open **unticked** — "within tolerance", the bridge's pretick true, but the office IDS badge `✗ rejected (1)` (as MA4d; decision 2's IDS clause, open question 1); **Untick all**, then **Tick suggested** → the level alone ticked. Tick the three walls by hand.
- **R-3 Revit's re-read** — Apply the four → `Applied 4 element(s) … (ledger #N)` (Apply's IDS stage asks for the three walls, as MA4e R-1). `b4100 GET changesets/ma4c-drill/<L01 id>` → `result.reported_role` a member's role (not `service`) and `result.applied`: the level's entry has no `reread`; each wall's `reread {mesh_sha256 (64 hex), faces}`; with a Node one-liner on the answer, each wall's left and right faces sit at ± `facts.thickness_mm` / 2 from its filed line to 0.1 mm (MA-4e's R-1: Wall Centerline, widths 300 / 200 / 300), z 3000 → 5800, and each side's ends where Revit's joins put them (record the four u ranges; each within a thickness and 100 mm of the filed ends, or that wall reads `why: "Revit's re-read is N mm off its filed wall …"`). The `changeset_applied` row #N (SQL, read only) carries the same entries. A wall whose `reread` holds `why`: record the words (that wall is measured as filed — a follow-up, not a fix here).
- **R-4 measured by Revit's re-read [founder]** — desk ↻ → `Survey job-0003 · Scan L01 job-0003` → **Measure against the scan** → `✓ Measured Survey job-0003 · Scan L01 job-0003 against the scan as Revit re-read it (the add-in's claim) — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 1 not measured · ledger #N`; the head starts `Measured against the scan as Revit placed it (Revit's re-read at Apply, the add-in's claim: …` and reads `placed as Revit reported (by <the person R-2 recorded>)` — record the head as it appears (a `— the machine credential's report` there means R-2's sign-in did not hold: every wall then reads as filed); p95 about 3 mm each (as #2225). The row (SQL): action `verify:measured job-0003 · sentinel-survey 0.1.0 · done · revit (claimed) · 3 within tolerance, …`, `claimed true`, `reference "revit (claimed)"`, each wall `reference "revit (claimed)"` and `mesh_sha256` equal to its `reread.mesh_sha256`, the level `not_measured`. **Measure again** at once → `Not measured — … was measured on these same inputs as ledger #N — …` (no row).
- **R-5 close** — close `ma4d.rvt` without saving (the drill's scratch copy: its binding and placements go with it). `Survey job-0003 · GR-FFL` stays **proposed** (drill MA4f-2 reviews it). Design rows to LANDED with the ledger ids; the session notes.

---

# MA-4f-2 — the scan overlay

### Task 7 — Survey: `thin` and `POST /cloud`

**Files:** modify `survey/pipeline.py`, `survey/service.py`, `survey/test_survey.py`.

- [ ] **Step 1: the failing tests** — in `test_survey.py`, after `class Voxel` (:268):

```python
class Thin(unittest.TestCase):
    """MA-4f: pipeline.thin — the scan overlay's points from the job's cloud."""

    def test_the_band_only_one_point_per_cube_the_cube_doubled_under_the_cap_the_same_twice(self):
        P = building()
        Q, cell, of = pipeline.thin(P, (300, 2500), 100, 10 ** 6)
        self.assertEqual(Q.dtype, np.int64)
        self.assertTrue(((Q[:, 2] >= 300) & (Q[:, 2] <= 2500)).all())
        self.assertEqual((cell, len(Q)), (100, of))
        Q2, cell2, of2 = pipeline.thin(P, (300, 2500), 100, of // 3)
        self.assertEqual(of2, of)
        self.assertGreater(cell2, 100)
        self.assertLessEqual(len(Q2), of // 3)
        np.testing.assert_array_equal(Q2, pipeline.thin(P, (300, 2500), 100, of // 3)[0])

    def test_nothing_in_the_band_is_no_point(self):
        Q, cell, of = pipeline.thin(building(), (90000, 91000), 100, 5000)
        self.assertEqual((Q.shape, cell, of), ((0, 3), 100, 0))
```

  and in `class InProcess`:

```python
    def test_a_cloud_reads_the_jobs_cloud_again_and_gives_whole_mm_points_in_the_band(self):
        item = self.item(building())
        service.JOB.clear()
        service.JOB.update(id="scan-1", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):
            service.run({"job_id": "scan-1", "items": [item], "params": {"voxel_mm": 20, "storey_min_mm": 2000}, "seed": 1,
                         "cloud": {"cell_mm": 100, "z_mm": [300, 2500], "max_points": 5000}})
        job = service.JOB
        self.assertEqual(job["status"], "done", job)
        pts, rc = job["result"]["points"], job["result"]["receipt"]
        self.assertTrue(0 < len(pts) <= 5000 and all(len(p) == 3 and all(isinstance(v, int) for v in p) and 300 <= p[2] <= 2500 for p in pts))
        self.assertEqual((rc["cloud"]["points"], rc["cloud"]["z_mm"], rc["seed"]), (len(pts), [300, 2500], 1))
        self.assertGreaterEqual(rc["cloud"]["of"], len(pts))
        self.assertNotIn("candidates", job["result"])
        self.assertEqual(job["result"]["derived"], [])

    def test_read_cloud_refuses_in_words(self):
        good = {"job_id": "scan-1", "items": [{"id": "ev-0001", "kind": "scan", "path": "x", "sha256": "a" * 64}], "params": {"voxel_mm": 20, "storey_min_mm": 2000},
                "seed": 1, "cloud": {"cell_mm": 100, "z_mm": [300, 2500], "max_points": 5000}}
        self.assertEqual(service.read_cloud(good)["cloud"], good["cloud"])
        for bad in ({**good, "cloud": None}, {**good, "cloud": {**good["cloud"], "cell_mm": 10}}, {**good, "cloud": {**good["cloud"], "z_mm": [2500, 300]}},
                    {**good, "cloud": {**good["cloud"], "z_mm": [0, float("nan")]}}, {**good, "cloud": {**good["cloud"], "max_points": 7}},
                    {**good, "cloud": {**good["cloud"], "max_points": True}}):
            with self.assertRaises(ValueError) as e:
                service.read_cloud(bad)
            self.assertEqual(str(e.exception), "cloud must be {cell_mm: 20 to 1000, z_mm: [low, high] mm, max_points: 8 to 100000}")
```

- [ ] **Step 2: run** — `"C:/Python314/python.exe" -B -m unittest discover -s survey -v` → the new tests fail.
- [ ] **Step 3: the code** — `pipeline.py`, after `voxel` (:77):

```python
def thin(P, z, mm, cap):
    """MA-4f: the scan overlay's points — the cloud between heights z[0] and z[1] (mm, the scan's frame), one point per mm cube, the cube doubled
    until at most cap are left (even over the walls, never a cut list; the same points every run). → (whole-mm int64 rows, the cube used, how many
    the first cube kept). cap >= 8 (read_cloud): a cube larger than the band's extent keys at most 2 cells an axis, 8 in all, so the doubling ends."""
    Q = P[(P[:, 2] >= z[0]) & (P[:, 2] <= z[1])]
    if not len(Q):
        return np.zeros((0, 3), np.int64), mm, 0
    none = np.zeros(len(Q), np.int8)
    T, _ = voxel(Q, none, float(mm))
    of = len(T)
    while len(T) > cap:
        mm *= 2
        T, _ = voxel(Q, none, float(mm))
    return np.round(T).astype(np.int64), mm, of
```

  `service.py`: the header comment gains `# MA-4f: POST /cloud — a job's own cloud read again, cut to a band and thinned for Revit's overlay (numbers only; the bridge moves them into the model's frame).`; after `MAX_FACES` (:29) add `MAX_CLOUD = 100_000  # MA-4f: the most overlay points a body may ask (the bridge asks 5 000)`; in `run` the first line after `started, cpu0 = …` becomes `measuring = "elements" in job or "cloud" in job  # MA-4e, MA-4f: a job's cloud read again — every item it read must be read again, or nothing is read` and the branch at :94-103 becomes:

```python
        if "cloud" in job:  # MA-4f: the overlay's points (the bridge cuts the band and moves them into the model's frame)
            P, _, points_in = pipeline.load(ok, job["params"], job["seed"], progress)
            c = job["cloud"]
            Q, cell, of = pipeline.thin(P, c["z_mm"], c["cell_mm"], c["max_points"])
            out = {"points": Q.tolist(), "derived": []}
            stats = {"points_in": int(points_in), "points_used": int(len(P)),
                     "cloud": {"cell_mm": int(cell), "z_mm": c["z_mm"], "of": int(of), "points": int(len(Q))}}
        elif measuring:
            …the MA-4e measure, unchanged…
        else:
            …survey, unchanged…
```

  after `read_measure` (:176):

```python
def read_cloud(b):
    """MA-4f: POST /cloud's body — a job's (read_job: its own items, params and seed, so the cloud is the one its candidates came from) plus
    cloud {cell_mm, z_mm: [low, high], max_points}; or ValueError in words."""
    m = read_job(b)
    c = b.get("cloud")
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) <= 1e9  # a NaN fails the bound
    whole = lambda v, lo, hi: isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi
    if not (isinstance(c, dict) and whole(c.get("cell_mm"), 20, 1000) and whole(c.get("max_points"), 8, MAX_CLOUD)  # 8: thin's doubling ends
            and isinstance(c.get("z_mm"), list) and len(c["z_mm"]) == 2 and all(num(z) for z in c["z_mm"]) and c["z_mm"][0] < c["z_mm"][1]):
        raise ValueError(f"cloud must be {{cell_mm: 20 to 1000, z_mm: [low, high] mm, max_points: 8 to {MAX_CLOUD}}}")
    return {**m, "cloud": {"cell_mm": c["cell_mm"], "z_mm": c["z_mm"], "max_points": c["max_points"]}}
```

  `do_POST`: `if self.path not in ("/jobs", "/measure", "/cloud"):` (comment: `# MA-4e, MA-4f: a measure and a cloud are this process's one run too, polled at /jobs/:id`) and `job = {"/measure": read_measure, "/cloud": read_cloud}.get(self.path, read_job)(json.loads(self.rfile.read(n) or b"null"))`. `VERSION` stays `"0.1.0"`.
- [ ] **Step 4: run** — all pass; `git status` shows no `__pycache__`.
- [ ] **Step 5: commit** — `feat(survey): MA-4f-2 - POST /cloud: a job's own cloud read again, cut to a band and thinned (the cube doubled under the cap) for Revit's overlay`

### Task 8 — Bridge: the slot's path, the shared chain, the overlay and its route

**Files:** modify `WebApp/bridge/build-jobs.mjs`, `build-jobs.test.mjs`, `survey-plan.mjs`, `survey-plan.test.mjs`, `changesets-store.mjs`, `changesets-store.test.mjs`, `bcf-service.mjs`; create `WebApp/bridge/fixtures/changeset-ops/scan-reply.json`.

- [ ] **Step 1: the shared fixture** — `fixtures/changeset-ops/scan-reply.json` (vitest holds `scanOverlay`'s reply to it; promote-check reads it into `ScanDto`):

```json
{
  "changeset": { "id": "5b1c6f3e-2a4d-4e8f-9c1a-7d2e3f4a5b6c", "name": "Survey job-0002 · GR-FFL" },
  "job": "job-0002", "ledger_id": 2201, "version": "0.1.0", "cell_mm": 100, "z_mm": [300, 2500], "of": 2,
  "points": [[40125, 150, 1400], [47850, 5900, 2500]]
}
```

- [ ] **Step 2: the failing tests** —
  - `build-jobs.test.mjs`, in "stillAdmitted and measureJob (MA-4e)":

```js
  it("MA-4f: the scan overlay takes the same slot — /cloud in the job's folder, and its own words to a job started meanwhile", async () => {
    const r = measureJob("demo", "job-0001", { job_id: "scan-c1", items: [], params: {}, seed: 1, cloud: {} }, deps(), { path: "/cloud", what: "a scan overlay" });
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0].opts).toEqual({ cwd: join(root, "demo", "job-0001"), path: "/cloud" });
    await expect(start()).rejects.toMatchObject({ status: 409, message: "a scan overlay is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    runs[0].ok({ status: "done", result: { points: [] } }); runs.pop();
    expect(await r).toMatchObject({ status: "done" });
  });
```

  - `survey-plan.test.mjs`: the import gains `scanBand, cloudRefusal`; append:

```js
describe("MA-4f — the scan overlay's cut and its answer", () => {
  const w = (z0, top) => ({ kind: "wall", place: { LocationCurve: { start: [0, 0, z0], end: [1000, 0, z0] }, TopElevation: top } });
  it("scanBand: the walls' height less 300 mm at the floor and the ceiling; none without a wall", () => {
    expect(scanBand({ elements: [w(0, 2800), w(0, 3000), { kind: "level", place: { BaseElevation: 0 } }] })).toEqual([300, 2700]);
    expect([scanBand({ elements: [] }), scanBand({ elements: [w(0, 500)] })]).toEqual([null, null]);
  });
  it("cloudRefusal: at most the cap, three whole mm each, its receipt", () => {
    const ok = { points: [[1, 2, 3]], receipt: { cloud: { cell_mm: 100, of: 1 } } };
    expect(cloudRefusal(ok, 5000)).toBeNull();
    expect([cloudRefusal({ ...ok, receipt: {} }, 5000), cloudRefusal({ ...ok, points: [[1, 2, 3], [4, 5, 6]] }, 1), cloudRefusal({ ...ok, points: [[1, 2]] }, 5000), cloudRefusal({ ...ok, points: [[1, 2, 3.5]] }, 5000)])
      .toEqual(["receipt.cloud", "not at most 1 points", "a point is not three whole numbers of mm", "a point is not three whole numbers of mm"]);
  });
});
```

  - `changesets-store.test.mjs`: the import gains `scanOverlay`; in the verify describe:

```js
  const CLOUD = () => vi.fn(async () => ({ status: "done", version: "0.1.0", refused: [], result: { points: [[125, 150, 1400], [7850, 5900, 2500]], derived: [],
    receipt: { cloud: { cell_mm: 100, z_mm: [300, 2500], of: 2, points: 2 } } } }));
  // The scan as MA-4a stores it: every USES key set (evidence-logic :266-268), viewing allowed. vdeps' SCAN (MA-4e) names geometry_extraction only.
  const SEEN = { ...SCAN, allowed_uses: { view_reference: true, geometry_extraction: true, texture_embed: false, redistribute: false, ml_training: false } };
  const sdeps = (over = {}, cs = CS) => vdeps({ readPack: vi.fn(async () => ({ pack: { items: [SEEN] }, folder: { path: DIR } })), measureJob: CLOUD(), ...over }, cs);
  it("(h) MA-4f: the scan around a survey changeset's storey for Revit's overlay — a signed-in contributor; the job's own cloud on the survey slot, the walls' height less 300 mm, in the model's frame; no row, no write", async () => {
    const deps = sdeps();
    const r = await scanOverlay("ma4c-drill", ID, deps);
    expect(deps.requireMinRole).toHaveBeenCalledWith("ma4c-drill", "contributor");
    expect(deps.measureJob.mock.calls[0]).toEqual(["ma4c-drill", "job-0002", { job_id: `scan-${ID}`, items: [{ id: "ev-0001", kind: "scan", path: resolve(DIR, "scans/two-storey.las"), sha256: EV }],
      params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1, cloud: { cell_mm: 100, z_mm: [300, 2500], max_points: 5000 } }, {}, { path: "/cloud", what: "a scan overlay" }]);
    expect(r).toEqual(readRepo("WebApp/bridge/fixtures/changeset-ops/scan-reply.json"));
    expect([deps.audit.mock.calls.length, deps.docInsert.mock.calls.length, deps.docReplaceIfField.mock.calls.length, deps.takeWriteBudget.mock.calls[0]])
      .toEqual([0, 0, 0, ["survey jobs", { perUser: 6, all: 12 }]]);
  });
  it("(i) MA-4f: the overlay's refusals say what is not shown — the machine credential, a viewer, not a survey changeset, no wall, the job's chain, viewing not allowed (fails closed), the scan not read again, the slot busy, an answer not the contract's", async () => {
    const no = async (over, cs, status, message) => { const deps = sdeps(over, cs); await expect(scanOverlay("ma4c-drill", ID, deps)).rejects.toMatchObject({ status, message }); return deps; };
    const machine = await no({ myRole: vi.fn(async () => "service") }, CS, 403,
      "showing a changeset's scan needs a person — it reads the whole scan on this PC's one survey slot: sign in (in Revit: Standards ▸ Sign in) — its scan is not shown");
    expect([machine.measureJob.mock.calls.length, machine.takeWriteBudget.mock.calls.length]).toEqual([0, 0]);
    await no({ requireMinRole: vi.fn(async () => { throw Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }); }) }, CS, 403,
      "this action requires the contributor role (you are viewer) — showing a survey changeset's scan runs sentinel-survey: a contributor's — its scan is not shown");
    await no({}, { ...CS, job: null, claimed: true }, 409, "Survey job-0002 · GR-FFL was not built from a survey job — it has no scan to show");
    await no({}, { ...CS, elements: [] }, 409, "Survey job-0002 · GR-FFL has no wall to show the scan against");
    await no({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SEEN, state: "changed" }] }, folder: { path: DIR } })) }, CS, 409,
      "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again — its scan is not shown");
    for (const uses of [{ ...SEEN.allowed_uses, view_reference: false }, { geometry_extraction: true }]) // false, and absent: fails closed, like pickItems
      await no({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SEEN, allowed_uses: uses }] }, folder: { path: DIR } })) }, CS, 409,
        "ev-0001's allowed uses do not include viewing it as a reference — its scan is not shown");
    await no({ measureJob: vi.fn(async () => ({ status: "refused", refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }] })) }, CS, 409,
      "the scan of Survey job-0002 · GR-FFL was not read again — ev-0001: changed since admitted (its sha256 is not the pack's) — Re-check flags it — its scan is not shown");
    await no({ measureJob: vi.fn(async () => { throw Object.assign(new Error("a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved"), { status: 409 }); }) }, CS, 409,
      "a survey job is already running on this bridge (one at a time) — try again when it ends — its scan is not shown");
    await no({ measureJob: vi.fn(async () => ({ status: "done", result: { points: [[1.5, 0, 0]], receipt: { cloud: { cell_mm: 100, of: 1 } } } })) }, CS, 502,
      "sentinel-survey's scan overlay is not the contract's shape (a point is not three whole numbers of mm) — its scan is not shown");
  });
```

- [ ] **Step 3: run** — `cd WebApp && npx vitest run bridge/build-jobs.test.mjs bridge/survey-plan.test.mjs bridge/changesets-store.test.mjs` → the new tests fail.
- [ ] **Step 4: the code** —
  - `build-jobs.mjs` `measureJob` (:316-325): the signature becomes `export async function measureJob(key, jobId, payload, deps = {}, { path = "/measure", what = "a measure" } = {})`; `running = { key, id: null, what, done: … }`; `d.runSurvey(payload, { cwd: …, path })`. Its doc comment gains `MA-4f: the scan overlay runs here too ({path: "/cloud", what: "a scan overlay"}).`
  - `survey-plan.mjs`, at the end:

```js
// ── MA-4f: the scan overlay (design §4 "In Revit: a decimated overlay drawn with DirectContext3D"). sentinel-survey thins; the bridge cuts and
//    places. ──

/** The overlay's first cube, its most points (6 vertices each as Revit's crosses: 30 000, inside any 16-bit index — GhostOverlayGeometry
 *  ScanBudget) and how much of a storey's height is left out at the floor and at the ceiling. */
export const SCAN_CELL_MM = 100, SCAN_MAX = 5000, SCAN_MARGIN_MM = 300;

/** MA-4f: the heights the overlay shows, in the model's frame — the changeset's walls, from their lowest base to their highest top, less
 *  SCAN_MARGIN_MM at each end (no floor or ceiling carpet over a plan; the survey's own wall slice is mid-storey ±300 mm). null with no wall to
 *  show it against. Pure. */
export function scanBand(cs) {
  const w = (cs.elements ?? []).filter((e) => e.kind === "wall" && Number.isFinite(e.place?.LocationCurve?.start?.[2]) && Number.isFinite(e.place?.TopElevation));
  if (!w.length) return null;
  const lo = Math.min(...w.map((e) => e.place.LocationCurve.start[2])) + SCAN_MARGIN_MM, hi = Math.max(...w.map((e) => e.place.TopElevation)) - SCAN_MARGIN_MM;
  return hi > lo ? [lo, hi] : null;
}

/** MA-4f: null when sentinel-survey's overlay answer has the contract's shape — at most `cap` points of three whole mm (within 1e9), its
 *  receipt.cloud naming the cube used and how many the first cube kept — else what is wrong. Pure. */
export function cloudRefusal(res, cap) {
  const c = res?.receipt?.cloud;
  if (!c || !Number.isInteger(c.cell_mm) || !Number.isInteger(c.of)) return "receipt.cloud";
  if (!Array.isArray(res.points) || res.points.length > cap || res.points.length > c.of) return `not at most ${cap} points`;
  if (!res.points.every((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isInteger(v) && Math.abs(v) <= 1e9))) return "a point is not three whole numbers of mm";
  return null;
}
```

  - `changesets-store.mjs`: the survey-plan import gains `toScan, toModel, scanBand, cloudRefusal, SCAN_CELL_MM, SCAN_MAX`. Lift `prepare`'s job block (:450-465, from `const { row } = await trustedJob(key, cs.job.id);` to the `items` map) unchanged into a module function before `verifyChangeset`, and call it from `prepare` as `const { row, evidence, items } = await jobScan(key, cs, { trustedJob, readPack });`:

```js
/** MA-4e's chain, shared with MA-4f's overlay: a survey changeset's job read again from its anchored row — trustedJob, the row the changeset was
 *  built from, its params and seed, every scan it read still the admitted bytes (stillAdmitted) and readable (pickItems), in the order it sent
 *  them. → {row, evidence, items, pack}, or a 400/404/409 in words. */
async function jobScan(key, cs, { trustedJob, readPack }) {
  const { row } = await trustedJob(key, cs.job.id);
  // …the lines moved from prepare, unchanged…
  return { row, evidence, items, pack };
}
```

    and after `verifyChangeset`:

```js
/** MA-4f: GET /changesets/:key/:id/scan → the scan around a survey changeset's storey, for Revit's overlay (design §4): the job's own cloud read
 *  again from its anchored row (jobScan — MA-4e's chain, plus each scan's view_reference use, failing closed), cut to the changeset's walls'
 *  height less SCAN_MARGIN_MM at the floor and the ceiling, one point per SCAN_CELL_MM cube (sentinel-survey doubles it until at most SCAN_MAX
 *  are left), moved into the model's frame by the lead's frame (toModel; one job is one frame) — whole mm. A signed-in contributor, like every
 *  sentinel-survey run (the machine credential is a 403); any status (most useful while reviewing). A view: no row, no doc, no file; the points
 *  are held in memory and answered, never logged. The run takes the bridge's one survey slot and the survey jobs' budget. Its refusals say what
 *  is not shown (one from the shared chain, the budget or the slot ends "nothing was saved": re-worded).
 *  ponytail: cold, no cache — each tick of "Show the scan" reads the scan again (seconds on the drill; Revit waits up to 120 s); a cache keyed on
 *  (the row, the evidence shas, the frame, the cut) and a 202 when Kladno's read is slow (MA-4h). */
export async function scanOverlay(key, id, deps = {}) {
  const d = wire(deps);
  const trustedJob = deps.trustedJob ?? jobOf, measureJob = deps.measureJob ?? measureOf;
  const readPack = deps.readPack ?? (await import("./evidence-store.mjs")).readPack;
  const shown = (e) => (e?.status ? err(e.status, `${String(e.message).replace(/(;| —) nothing was saved\.?$/, "")} — its scan is not shown`) : e);
  if ((await d.myRole(key)) === "service")
    throw err(403, "showing a changeset's scan needs a person — it reads the whole scan on this PC's one survey slot: sign in (in Revit: Standards ▸ Sign in) — its scan is not shown");
  try { await d.requireMinRole(key, "contributor"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — showing a survey changeset's scan runs sentinel-survey: a contributor's — its scan is not shown`) : e; }
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, `no changeset ${id} on ${key}`);
  if (!cs.job || cs.claimed !== false) throw err(409, `${cs.name} was not built from a survey job — it has no scan to show`);
  const band = scanBand(cs);
  if (!band) throw err(409, `${cs.name} has no wall to show the scan against`);
  let chain;
  try { chain = await jobScan(key, cs, { trustedJob, readPack }); } catch (e) { throw shown(e); }
  const { row, evidence, items, pack } = chain;
  // The owner's allowed uses (evidence-logic USES): an overlay is viewing a scan as a reference. Fails closed, like pickItems — and this is
  // the first route whose answer (derived points) leaves the PC, over the Funnel to a member's Revit.
  const hidden = pack.items.find((i) => evidence.some((e) => e.id === i.id) && i.allowed_uses?.view_reference !== true);
  if (hidden) throw err(409, `${hidden.id}'s allowed uses do not include viewing it as a reference — its scan is not shown`);
  try { d.takeWriteBudget("survey jobs", { perUser: 6, all: 12 }); } catch (e) { throw shown(e); } // a run on the PC's CPU (MA-4e decision 13)
  const S = toScan(cs.job.frame);
  let r;
  try {
    r = await measureJob(key, cs.job.id, { job_id: `scan-${cs.id}`, items, params: row.params, seed: row.seed,
      cloud: { cell_mm: SCAN_CELL_MM, z_mm: band.map(S.z), max_points: SCAN_MAX } }, {}, { path: "/cloud", what: "a scan overlay" });
  } catch (e) { throw shown(e); } // not set up (503), busy (409)
  if (r.status === "refused") throw err(409, `the scan of ${cs.name} was not read again — ${(r.refused ?? []).map((i) => `${i.id}: ${i.reason}`).join("; ")} — its scan is not shown`);
  if (r.status !== "done") throw err(502, `the scan of ${cs.name} was not read: ${r.error ?? "sentinel-survey did not finish"} — its scan is not shown`);
  const bad = cloudRefusal(r.result, SCAN_MAX);
  if (bad) throw err(502, `sentinel-survey's scan overlay is not the contract's shape (${bad}) — its scan is not shown`);
  const M = toModel(cs.job.frame), c = r.result.receipt.cloud;
  return { changeset: { id: cs.id, name: cs.name }, job: cs.job.id, ledger_id: row.ledger.id, version: r.version ?? null, cell_mm: c.cell_mm, z_mm: band, of: c.of,
    points: r.result.points.map(([x, y, z]) => [...M.xy([x, y]), M.z(z)].map(Math.round)) };
}
```

  - `bcf-service.mjs`, before `if (p2 && !p3 && req.method === "GET")` in the `/changesets` block:

```js
      // MA-4f: the scan around a survey changeset's storey, decimated, in the model's frame — Revit's overlay (changesets-store scanOverlay). A view:
      //   a signed-in contributor (the machine credential is a 403); no row; the run takes the bridge's one survey slot.
      if (p2 && p3 === "scan" && req.method === "GET") return send(res, 200, await ch.scanOverlay(key, p2));
```

- [ ] **Step 5: run** — the three files pass, and MA-4e's verify tests (a)–(g) still pass (the chain moved unchanged).
- [ ] **Step 6: commit** — `feat(bridge): MA-4f-2 - GET /changesets/:key/:id/scan: the job's own scan, cut to the storey's walls and thinned by sentinel-survey, in the model's frame (a signed-in contributor, no row); MA-4e's chain shared as jobScan`

### Task 9 — Add-in: the overlay

**Files:** modify `SentinelAddin/Coordination/ChangesetClient.cs`, `SentinelAddin/GhostBuilder/GhostOverlayGeometry.cs`, `SentinelAddin/GhostBuilder/GhostOverlayServer.cs`, `SentinelAddin/UI/ChangesetReviewWindow.cs`, `SentinelAddin/Commands.ReviewChangesets.cs`, `tools/promote-check/Ma4f.cs`, `tools/promote-check/Ma3c.cs`, `tools/promote-check/Check.cs`.

- [ ] **Step 1: the failing pins** — append to `Ma4f.cs` (inside `static partial class Check`):

```csharp
    // ── MA-4f-2: the scan overlay — the bridge's answer, the crosses (pure) and the wiring ──
    static void Ma4f2Checks()
    {
        Console.WriteLine("\nMA-4f — the scan overlay: the bridge's answer, the crosses (pure) and the wiring");
        var fx = JsonSerializer.Deserialize<ScanDto>(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "scan-reply.json")));
        Ok(fx.Job == "job-0002" && fx.LedgerId == 2201 && fx.CellMm == 100 && fx.ZMm.SequenceEqual(new double[] { 300, 2500 }) && fx.Of == 2
           && fx.Points.Count == 2 && fx.Points[0].SequenceEqual(new double[] { 40125, 150, 1400 }),
           "the bridge's scan reply (the fixture vitest holds scanOverlay to) reads: its job, row, cube, heights, count and points in the model's mm");
        var segs = GhostOverlayGeometry.ScanCrosses(fx.Points, GhostOverlayGeometry.ScanBudget);
        Ok(segs.Count == 6 && segs.All(s => s.R == 0 && s.G == 160 && s.Bl == 220)
           && segs.Take(3).All(s => Enumerable.Range(0, 3).Sum(k => Math.Abs(s.B[k] - s.A[k])) == GhostOverlayGeometry.ScanCrossMm)
           && segs[0].A.SequenceEqual(new double[] { 40095, 150, 1400 }) && segs[2].B.SequenceEqual(new double[] { 40125, 150, 1430 }),
           "each point is a cyan cross of three 60 mm arms about it");
        var many = Enumerable.Range(0, 6000).Select(i => new double[] { i, 0, 0 }).ToList();
        Ok(GhostOverlayGeometry.ScanCrosses(many, GhostOverlayGeometry.ScanBudget).Count == 3 * 5000 && GhostOverlayGeometry.ScanBudget * 6 <= 32767
           && GhostOverlayGeometry.ScanCrosses(new List<double[]> { null, new double[] { 1, 2 }, new double[] { 1, double.NaN, 3 } }, 10).Count == 0
           && GhostOverlayGeometry.ScanCrosses(null, 10).Count == 0,
           "at most 5 000 points are drawn (30 000 vertices: inside any 16-bit index); a point short of three finite numbers, and none, draw nothing");
        Ok(GhostOverlayGeometry.ScanLine(fx, 2) == "Scan: 2 of 2 point(s) drawn as cyan crosses — job-0002 (ledger #2201), one point per 100 mm, 300–2500 mm high (the walls less 300 mm at the floor and ceiling), placed by the lead's frame; nothing is written. Untick to hide.",
           "the window's line says how many, from which job, how thinned and how placed");
        string cli = Src("Coordination", "ChangesetClient.cs"), rev = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs"), srv = Src("GhostBuilder", "GhostOverlayServer.cs");
        Ok(cli.Contains("/{Uri.EscapeDataString(id)}/scan\";") && cli.Contains("var (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));"),
           "the scan is read with the person's token (a signed-out Revit sends the file's, which the bridge refuses in words), waiting as long as a write: the bridge runs sentinel-survey");
        Ok(win.Contains("public event Action<bool> ScanRequested;") && win.Contains("Visibility = _cs.Claimed == false ? Visibility.Visible : Visibility.Collapsed"),
           "\"Show the scan\" is offered on a survey changeset only, unticked");
        int ask = rev.IndexOf("window.ScanRequested +=", StringComparison.Ordinal);
        Ok(ask > 0 && rev.IndexOf("Task.Run(() =>", ask, StringComparison.Ordinal) < rev.IndexOf("var got = ChangesetClient.FetchScan(cfg, key, cs.Id, out var err);", StringComparison.Ordinal)
           && rev.Contains("App.Events.Enqueue(doc, \"draw the scan overlay\"") && rev.Contains("if (window.Gone || ask != scanAsk || scanOn != null) return;")
           && rev.Contains("window.Closed += (_, _) => { scanAsk++; ScanOff(\"the window closed\"); };") && !rev.Contains("ScanOff(\"Apply\")"),
           "the scan is read off Revit's thread, drawn through the hub on the model in front (the newest tick wins), removed when unticked or the window closes — not at Apply");
        Ok(rev.Contains("void ScanOff(string why) => App.Events.Enqueue(ua =>") && rev.Contains("var s = scanOn; scanOn = null;")
           && rev.Contains("if (!on) { window.Shown(window.Applied ? \"\" : GhostOverlayGeometry.Line(creates, outlined)); return; }"),
           "scanOn is read and written on Revit's thread only (the removal is a hub job: an untick during the draw removes what it drew); unticking puts the ghost line back");
        Ok(rev.IndexOf("got.Points", StringComparison.Ordinal) == rev.LastIndexOf("got.Points", StringComparison.Ordinal) && rev.Contains("ScanCrosses(got.Points,"),
           "the scan's points go into the crosses only — never into a line, the Doctor or a file (the lines carry counts)");
        Ok(srv.Contains("_bounds = GhostOverlayGeometry.Bounds(_segments); Drop();") && srv.Contains("var b = _bounds;") && srv.Contains("{_name}: drawn in"),
           "one server class draws both overlays: its name in the Doctor's lines, its bounds once a geometry (not each frame)");
    }
```

  `Check.cs`: after `Ma4fChecks();` add `Ma4f2Checks();`. `Ma3c.cs:53`: `srv.Contains("Ghost overlay: drawn in")` → `srv.Contains("{_name}: drawn in")`. `Ma3c.cs:78`: `Count(rev, "GhostOverlayServer.Register(") == 1 && Count(rev, "GhostOverlayServer.Remove(") == 1, "MA-3c: the overlay is registered once and removed in one place"` → `== 2 && … == 2, "MA-3c: the overlay is registered once and removed in one place — MA-4f: and the scan overlay likewise"`.
- [ ] **Step 2: run** — `dotnet run --project tools/promote-check` → it does not compile (`ScanDto`, `ScanCrosses` missing).
- [ ] **Step 3: the code** —
  - `ChangesetClient.cs`, after `AppliedEntry`:

```csharp
/// <summary>MA-4f: GET /changesets/:key/:id/scan — the scan around a survey changeset's storey, thinned by sentinel-survey and moved into the
/// model's frame by the bridge (whole mm, Revit's internal frame).</summary>
public sealed class ScanDto
{
    [JsonPropertyName("job")] public string Job { get; set; }
    [JsonPropertyName("ledger_id")] public long? LedgerId { get; set; }
    [JsonPropertyName("cell_mm")] public int CellMm { get; set; }
    [JsonPropertyName("z_mm")] public double[] ZMm { get; set; }
    [JsonPropertyName("of")] public int Of { get; set; }
    [JsonPropertyName("points")] public List<double[]> Points { get; set; } = new();
}
```

    and after `FetchOne`:

```csharp
    /// <summary>MA-4f: the scan overlay's points. The bridge reads the job's scan again on its one survey slot (seconds on the drill), so this read
    /// waits as long as a write (120 s) — off Revit's thread, like every call here.</summary>
    public static ScanDto FetchScan(BcfConfig cfg, string projectKey, string id, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/scan";
            var (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            return JsonSerializer.Deserialize<ScanDto>(body);
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return null; }
    }
```

  - `GhostOverlayGeometry.cs`: add `using System.Globalization;`; after `Line` (:160):

```csharp
        // ── MA-4f: the scan overlay — each point a small 3-arm cross (DirectContext3D draws 1-pixel lines and has no point size) ──
        /// <summary>At most this many points are drawn: 6 vertices each, 30 000 in one buffer — inside any 16-bit index width (Revit sizes its index
        /// buffers in short ints); the bridge sends no more (survey-plan SCAN_MAX). ponytail: one buffer; chunked buffers if a denser overlay is wanted.</summary>
        public const int ScanBudget = 5000;
        public const double ScanCrossMm = 60;
        /// <summary>Cyan: none of the ghosts' green, grey or red.</summary>
        public static readonly (byte R, byte G, byte B) ScanColour = (0, 160, 220);

        /// <summary>Three segments a point (±ScanCrossMm/2 along x, y and z), for the first <paramref name="budget"/> points with three finite
        /// numbers; none for none.</summary>
        public static List<Segment> ScanCrosses(IReadOnlyList<double[]> pts, int budget)
        {
            const double h = ScanCrossMm / 2;
            var segs = new List<Segment>();
            var c = ScanColour;
            foreach (var p in (pts ?? Array.Empty<double[]>()).Where(q => q != null && q.Length >= 3 && q.Take(3).All(v => !double.IsNaN(v) && !double.IsInfinity(v))).Take(budget))
            {
                segs.Add(new Segment { A = new[] { p[0] - h, p[1], p[2] }, B = new[] { p[0] + h, p[1], p[2] }, R = c.R, G = c.G, Bl = c.B });
                segs.Add(new Segment { A = new[] { p[0], p[1] - h, p[2] }, B = new[] { p[0], p[1] + h, p[2] }, R = c.R, G = c.G, Bl = c.B });
                segs.Add(new Segment { A = new[] { p[0], p[1], p[2] - h }, B = new[] { p[0], p[1], p[2] + h }, R = c.R, G = c.G, Bl = c.B });
            }
            return segs;
        }

        /// <summary>The window's line once the scan is drawn: <paramref name="drawn"/> points of the scan's.</summary>
        public static string ScanLine(ScanDto s, int drawn)
        {
            string F(double v) => v.ToString("0", CultureInfo.InvariantCulture);
            return $"Scan: {drawn} of {s.Of} point(s) drawn as cyan crosses — {s.Job} (ledger #{s.LedgerId}), one point per {s.CellMm} mm, {F(s.ZMm[0])}–{F(s.ZMm[1])} mm high (the walls less 300 mm at the floor and ceiling), placed by the lead's frame; nothing is written. Untick to hide.";
        }
```

  - `GhostOverlayServer.cs`: fields gain `private readonly string _name; private double[][] _bounds;`; the constructor and `Update` become (the constructor still drops `tris`, as today — the ghost's `Update` sets them before `Register` and the scan has none; ponytail: left out of this slice):

```csharp
        public GhostOverlayServer(Document doc, string title, List<GhostOverlayGeometry.Segment> segments, List<GhostOverlayGeometry.Tri> tris = null, string name = "Ghost overlay")
        { _doc = doc; _title = title ?? ""; _name = name ?? "Ghost overlay"; _segments = segments ?? new List<GhostOverlayGeometry.Segment>(); _bounds = GhostOverlayGeometry.Bounds(_segments); }

        /// <summary>New segments (a tick, a lock): the buffers are rebuilt on the next frame; the bounds now (MA-4f: once a geometry, not each frame).</summary>
        public void Update(List<GhostOverlayGeometry.Segment> segments, List<GhostOverlayGeometry.Tri> tris = null) { _segments = segments ?? new List<GhostOverlayGeometry.Segment>(); _tris = tris ?? new List<GhostOverlayGeometry.Tri>(); _bounds = GhostOverlayGeometry.Bounds(_segments); Drop(); }
```

    `GetName() => "Sentinel " + _name.ToLowerInvariant();`, `GetDescription() => _name + " of an open Review AI Proposals window: " + _title;`; both Doctor lines start `$"{_name}: asked for …` and `$"{_name}: drawn in …` (the rest unchanged); `GetBoundingBox`: `var b = _bounds;`. The file's header comment gains `MA-4f: a second instance, named "Scan overlay", draws a survey changeset's scan as crosses.`
  - `ChangesetReviewWindow.cs`: after `public event Action RetryRequested;` (:36) add `/// <summary>MA-4f: "Show the scan" ticked (true) or unticked (false) — a survey changeset only.</summary> public event Action<bool> ScanRequested;` (two lines); before `buttons.Children.Add(_retry);` (:146):

```csharp
        // MA-4f: a survey changeset's scan, drawn as crosses beside the ghosts — off until ticked (each tick reads the scan again on the bridge's
        // one survey slot); a changeset that is a claim has no scan.
        var scan = new CheckBox { Content = "Show the scan", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0),
                                  Visibility = _cs.Claimed == false ? Visibility.Visible : Visibility.Collapsed };
        scan.Checked += (_, _) => ScanRequested?.Invoke(true);
        scan.Unchecked += (_, _) => ScanRequested?.Invoke(false);
        buttons.Children.Add(scan);
```

  - `Commands.ReviewChangesets.cs`, after `window.Closed += (_, _) => OverlayOff("the window closed");` (:418):

```csharp
        // MA-4f: the scan overlay — "Show the scan" on a survey changeset: the bridge reads the job's scan again (GET …/:id/scan, off Revit's
        // thread) and a second overlay draws it as cyan crosses in this model's 3D views, plans and sections. It stays after Apply (the placed
        // walls against the scan) and goes when unticked or the window closes; the newest tick wins. Nothing is written.
        // Review (critique M1): scanOn is read and written on Revit's thread only — the removal is a hub job too, and the hub runs its jobs one at
        // a time in order, so an untick that lands while the draw job runs removes what it drew. scanAsk is bumped on the window's thread.
        GhostOverlayServer scanOn = null;
        var scanAsk = 0;
        void ScanOff(string why) => App.Events.Enqueue(ua =>
        {
            var s = scanOn; scanOn = null;
            if (s == null) return;
            try { GhostOverlayServer.Remove(ua, s); } catch (Exception ex) { App.PanelVm?.LogDoctor($"Review AI Proposals: the scan overlay was not removed ({why}) — {ex.GetType().Name}: {ex.Message}"); }
        }, "remove the scan overlay");
        window.ScanRequested += on =>
        {
            var ask = ++scanAsk;
            ScanOff("unticked");
            // MA-3c's ghost line and the scan's share the window's line: unticking puts the ghost's back (none after Apply: its overlay is gone).
            if (!on) { window.Shown(window.Applied ? "" : GhostOverlayGeometry.Line(creates, outlined)); return; }
            window.Shown("Reading the scan on the bridge…");
            Task.Run(() =>
            {
                var got = ChangesetClient.FetchScan(cfg, key, cs.Id, out var err);
                if (ask != scanAsk) return; // a newer tick or untick since: this answer is not shown
                if (got == null) { window.Shown("The scan was not drawn — " + err); return; }
                var segs = GhostOverlayGeometry.ScanCrosses(got.Points, GhostOverlayGeometry.ScanBudget);
                App.Events.Enqueue(doc, "draw the scan overlay", (ua, _) =>
                {
                    if (window.Gone || ask != scanAsk || scanOn != null) return;
                    var s = new GhostOverlayServer(doc, cs.Name, segs, null, "Scan overlay");
                    scanOn = s;
                    try { GhostOverlayServer.Register(ua, s); window.Shown(GhostOverlayGeometry.ScanLine(got, segs.Count / 3)); }
                    catch (Exception ex) { ScanOff("the registration failed"); window.Shown($"The scan could not be drawn — {ex.GetType().Name}: {ex.Message}"); }
                }, refusal => window.Shown($"The scan was not drawn — {refusal}"));
            });
        };
        window.Closed += (_, _) => { scanAsk++; ScanOff("the window closed"); };
```

- [ ] **Step 4: run** — `dotnet run --project tools/promote-check` → all pass (record n); the compile gate (the `-p:DeployToRevit=false` loop, never `build.ps1` before the merge) → every version 2021–2027 builds.
- [ ] **Step 5: commit** — `feat(addin): MA-4f-2 - Show the scan: the job's scan, decimated, drawn as cyan crosses by a second DirectContext3D overlay (3D, plans, sections) until unticked or closed, its state on Revit's thread only; the server named, its bounds once a geometry; pins`

### Task 10 — Docs: the design rows (4f-2)

**Files:** modify `docs/strategy/2026-09-30-model-automation-design.md`.

- [ ] **Step 1:**
  - `:454` append: ` MA-4f BUILT: sentinel-survey \`POST /cloud\` re-reads the job's own cloud from its row, cut to a changeset's walls' height less 300 mm at the floor and ceiling, one point per 100 mm cube (doubled until at most 5 000); the bridge moves it into the model's frame (\`GET /changesets/:key/:id/scan\`, a signed-in contributor, no row); **Show the scan** in Review AI Proposals draws it as cyan crosses (DirectContext3D: 3D, plans, sections) until unticked or closed. Nothing enters the model.`
  - after `:893` add `- \`GET /changesets/:key/:id/scan\` → \`{changeset, job, ledger_id, version, cell_mm, z_mm, of, points}\` (MA-4f; a view: a signed-in contributor, the machine credential a 403 — a run on the one survey slot; each scan's \`view_reference\` must be true; no row).`
  - after `:920` add `- MA-4f: \`POST /cloud\` \`{job_id, items, params, seed, cloud: {cell_mm, z_mm: [low, high], max_points}}\` → 202, polled and read as a job → \`{points: [[x, y, z] whole mm, the scan's frame], derived: [], receipt: {…, cloud: {cell_mm, z_mm, of, points}}}\` — the job's own items, params and seed; numbers only, no file; the version stays 0.1.0 (a new route; the read is unchanged).`
  - after `:967` add the row `| See a survey changeset's scan in Revit (a sentinel-survey run) | contributor, signed in (by name); the machine credential is a 403 (MA-4f) |`.
  - `:1151` append ` — BUILT in MA-4f (Show the scan).`
- [ ] **Step 2: commit** — `docs: MA-4f-2 - the design: the scan overlay (POST /cloud, GET …/scan, Show the scan)`

### Task 11 — Final checks (nothing to commit)

As Task 6, plus the survey suite (the new tests pass; no `__pycache__`), `git diff --name-only master | grep migrations/` → nothing; `git log --oneline master..HEAD` (four commits).

## Live drill MA4f-2 (the controller; the founder only if Revit's sign-in has lapsed)

V-rows before the merge (4101 on the branch, and in memory); R-rows after the merge on Revit 2024 against 4100 restarted on master, **Revit signed in** (Standards ▸ Sign in shows a person — the route refuses the machine credential, decision 10; if Revit's kept session has lapsed, the sign-in is **[founder]**).

- **V-0 the machine credential is refused** — `b4101 GET changesets/ma4c-drill/<e9130eec… (job-0002 GR-FFL)>/scan` with the machine credential → 403 `showing a changeset's scan needs a person — it reads the whole scan on this PC's one survey slot: sign in (in Revit: Standards ▸ Sign in) — its scan is not shown`; `tasklist` → no python.exe started by 4101; the ledger count unchanged (no row).
- **V-1 the overlay's numbers on the drill's own bytes (in memory, nothing written)** — a scratchpad script that puts `survey/` on `sys.path` and runs `service.run` (as `InProcess` does) with job-0002's items, params and seed (from its `job.json` in `%APPDATA%\Sentinel\jobs\ma4c-drill\job-0002`, the scan at `%APPDATA%\Sentinel\evidence\ma4c-drill\scans\two-storey.las`, sha `244cba9d…`) and `cloud {cell_mm: 100, z_mm: [300, 2500], max_points: 5000}` (`-B`: no `__pycache__`) → `done`; record `points` (≤ 5 000), the cube used, `of` and the time; every z within 300–2 500; moved by the lead's frame (dx 40 000), every x within 39 800–48 200 and y within −200–6 200. Then `[3300, 5500]` (L01's band): every z within it.
- **D-1 merge and deploy** — as MA4f-1's D-0 and D-1 (Revit closed after checking open documents; `build.ps1` deploys 2021–2027; 4100 restarted on master; no web publish: nothing on the web changed).
- **R-1 3D** — Revit 2024 (Load Once), `ma4d.rvt` as saved (unbound: **Sentinel ▸ Project Setup → bind `ma4c-drill`**, never saved), signed in (record who), a 3D view: Review AI Proposals → double-click `Survey job-0003 · GR-FFL` (proposed since MA4f-1) → the ghosts drawn (MA-3c); tick **Show the scan** → `Reading the scan on the bridge…`, then `Scan: N of M point(s) drawn as cyan crosses — job-0003 (ledger #…), one point per 100 mm, 300–2500 mm high …`; the crosses sit on the ghost walls' faces (and on wall-4, the type gap, which has no ghost); the Doctor says `Scan overlay: asked for the ThreeD view …` and `Scan overlay: drawn in the ThreeD view … — 3N line(s), 0 face(s)` — counts only, no coordinate.
- **R-2 plan and section box (observed, not fixed)** — the GR-FFL floor plan: are the crosses drawn (the Doctor's FloorPlan line), and does the view range cut them? The 3D view with the section box on: clipped or not? Record both; open question 4 if either reads wrong.
- **R-3 the lifetime** — untick → the crosses go and the window's line is MA-3c's ghost line again; tick → `Reading…`, then back (a second read; `tasklist` shows python.exe only during it) — **wait for the Scan line before ticking again**: a re-tick while a read runs gets the slot's 409, said in the window (`The scan was not drawn — Bridge 409: … a scan overlay is already running … — its scan is not shown`), and the first answer is dropped; tick the three walls → Apply → the ghosts go, **the crosses stay** over the placed walls; close the window → the crosses go; the Undo list holds only Apply's entry. (The Apply also re-reads GR-FFL's walls: record their `reread` from `b4100 GET changesets/ma4c-drill/<id>` — a named, unchecked level — as a bonus for MA4f-1.)
- **R-4 responsiveness** — orbit and zoom the 3D view with the crosses on: no stall (record the point count and a subjective note).
- **R-5 close** — close `ma4d.rvt` without saving; design rows to LANDED; session notes.

## Risks

- **The re-read is the add-in's claim.** A contributor's token can post any mesh. The bridge bounds it by the filed wall (each side within 1.5 × the thickness of the line, ends within a thickness and 100 mm, height within 100 mm — decision 6), keeps none from the machine credential, and the row says `claimed: true`, `revit (claimed)` on its action line and per element, and names who filed Revit's report (`placed_by`); the as-filed geometry stays the bridge's own on the changeset. Inside the bounds a forged mesh can still move each plane up to a thickness — the bound is the location line's and the type's reach, and the row says whose word it is.
- **The re-read is Revit's at Apply**: a wall moved or edited after Apply, or a model closed unsaved, is not seen (the scope line said otherwise; corrected in decision 7, the desk and the design). A re-read on demand is Next.
- **A bounding rectangle per side**: an opening or a niche is drawn over (none in survey walls before MA-5); a sweep, a reveal or a turned face → `why` → as filed.
- **Joins**: each side's ends are Revit's; the service reads 200 mm in from every edge, so most of a join's change is not judged.
- **The face-normal assumption**: `meshFaces` reads normals both ways (winding not trusted) and needs only the side planes; R-3 checks the offsets live.
- **Revit now pre-ticks** measured survey creates the office IDS did not reject. The web desk's "pre-ticked" (the bridge's `pretick`) does not read the verdict, so Revit and the desk differ on an IDS-rejected create (the desk shows its badge beside it); open question 1 is the bridge-wide variant. On `ma4c-drill` every survey wall is IDS-rejected (no BDS parameters until MA-5/MA-7), so only L01's created level shows the positive pre-tick live; the wall case is pinned in promote-check. A person still clicks Apply, and Apply's IDS and BLOCK stages still ask.
- **Merged before its Revit rows** (MA-4d's order): every new path falls back to MA-4e's (no or a bad mesh → as filed; an old bridge drops the mesh; the overlay is off until ticked). A Revit-row failure is a fix-forward on a branch. The compile gate never deploys (`-p:DeployToRevit=false`); only D-1's `build.ps1` does.
- **A signed-out Revit**: its report carries the machine credential, so every wall is measured as filed (the entry says why) and Show the scan answers 403 in words. The drill checks the sign-in at R-2 (MA4f-1) and before R-1 (MA4f-2).
- **Mixed deploys**: an add-in before MA-4f sends no mesh and pre-ticks no create; a new add-in against an old bridge has its mesh dropped and its scan read answered 404 (said in the window).
- **The overlay takes the survey slot**: a 409 in words while a survey job or a measure runs; each tick reads the scan again (no cache) and spends the shared `survey jobs` bucket; Revit waits up to 120 s (a Kladno read may exceed it — MA-4h). Only signed-in contributors run it; the machine credential is refused, so no uncounted local loop holds the slot. A fast untick and re-tick meets its own 409 (said in the window; R-3 waits for the Scan line).
- **DirectContext3D in plans and with a section box** is unproven for the scan (R-2 observes); lines are 1 pixel; 5 000 points is a sketch on a large storey (the cube doubles: the line says how coarse).
- **16-bit indices**: the 5 000-point budget fits either width; the ghost overlay is unchanged.
- **The overlay's frame is the lead's statement** — a wrong frame shows as the scan off the ghosts, which is what a person needs to see before Apply.
- **An owner's "no viewing"** is honoured and the check fails closed (`view_reference !== true`, as `pickItems`); MA-4a's pack sets it true by default.
- **Scan-derived points leave the PC** (the first route to send them: over the Funnel to a member's Revit; the pack's policy is `redistribute: false`): 5 000 thinned points of one storey, held in memory and drawn — never written, logged or put in a line (`ScanLine` and the Doctor lines carry counts; pinned). A member who can Apply in Revit already sees the walls placed from them.

## Next (out of scope here)

- **A re-read on demand** — a Revit command (or a review action) that re-reads placed survey walls and posts them, so a measure sees a wall moved after Apply; a `POST /changesets/:key/:id/reread` with its own row.
- **A pre-placement deviation per candidate at job time** (the tolerances already go to `/jobs`, `build-jobs.mjs:177`) — only if the founder wants the pre-tick on deviation (open question 2).
- **MA-4g** — E57, LAZ, the CRS; a computed frame. **MA-4h** — Kladno: `/cloud`'s run time and memory, a cache and a 202 for the overlay, the knobs; floors, ceilings and levels re-read and measured. **MA-4i** — the scan in the web desk. **MA-5** — openings in the re-read's faces; scan walls matched to existing walls.
- Chunked overlay buffers past 5 000 points; a ribbon toggle for a scan without a changeset; an RCP link where ReCap exists (design :454).

## Critique applied (the readers' findings, verified against the code)

- **The service takes rectangles only** (`read_measure`, `pipeline.deviation`), and a new service version would fail every measured job (`changesets-store.mjs:397-400`) → the bridge reduces the mesh to facesOf's two rectangles (decision 6); no service change in 4f-1.
- **The scope's "it shows a wall moved since"** is wrong: the mesh is read inside Apply → corrected in decision 7, the desk words and the design row.
- **A refused result strands the PC's record** (`UnreportedResults.Outcome` drops it on a 400 while the elements stay in the model) → a bad mesh is said on the entry, never a 400 (decision 5).
- **Accuracy alone would tick walls the bridge did not pre-tick** (a named, unchecked level — GR-FFL) → the rule reads the bridge's `pretick` too (decision 2).
- **The replay key would refuse the first Revit-referenced measure** when the re-read equals the as-filed faces → `reference` joins the key (decision 7; pinned in (g)).
- **Indices are sized in short ints and MA-3c does not chunk** → a 5 000-point budget (30 000 vertices) that fits either index width (decision 11).
- **The constructor drops its `tris`; `GetBoundingBox` recomputes per call** → the bounds are cached while the server gains its name; the `tris` are left (round 2, Trust 10: the scan passes none) (decision 11).
- **One job is one frame, and a job has no frame** → the overlay is keyed on the changeset and placed by its stored frame (decisions 9-10).
- **The pin file name**: the MA-4e plan's Next said `Ma4e.cs`; the pins are MA-4f's → `Ma4f.cs` (decision 12).

## Critique not taken

- **A float32 binary overlay with a cache file and an `X-Sentinel-Scan` header** (reader A) — JSON of 5 000 whole-mm points is ~100 KB, read by `System.Text.Json` and pinned by one fixture; the cache waits for a slow read (MA-4h).
- **500 000 overlay points** (reader A) — past one 16-bit index buffer; chunking is code for a need not yet seen.
- **`PointList` dots** (reader B) — one pixel, no point size in DirectContext3D.
- **A `JobRefDto` on `ChangesetDto`** (reader B) — `Claimed == false` already marks a changeset built from a job.
- **Triangles grouped per face and re-wound in the add-in** (reader C) — the bridge needs only the two side planes and reads normals both ways.
- **The largest 1 mm offset bin per side** (reader D) — a side must be one plane within 1 mm or it falls back to as filed: simpler, and honest about a sweep.

## Critique applied, round 2 (the feasibility and trust-scope critics, each finding checked at `c3aac94`)

Changed:
- **C1 (critical) — `FILED` was already declared in `changesets-store.mjs:214`** (the filed statuses) → the import is `FILED as AS_FILED` and the replay clause reads `pv.reference ?? AS_FILED` (Task 2, decision 7, Interfaces).
- **Trust 1 (critical) — the claim picked what was measured** → `meshFaces` holds the re-read to the filed wall's line, thickness, base and top (decision 6); pinned with a box 2 000 mm off, one 50 m long and one a storey up, and with the bounds' own edges kept (Task 1). The plan's Task 1 tests were run against its code in a scratch module: 5 of 5 pass.
- **Trust 2 (critical) — the row said `claimed: false` and its action line hid the claim** → `claimed: reference !== AS_FILED`, ` · revit (claimed)` / ` · mixed: revit (claimed) and as filed` on the action line, and the desk's status line says "(the add-in's claim)" (decisions 7-8; pinned in (g) and the desk test).
- **I1 — `ma4d.rvt` is not bound when it opens** (`SettingsManager.cs:29`; `SIMULATION_ROOM_RUN_2026-09-22.md:2604`) → R-2 (MA4f-1) and R-1 (MA4f-2) bind it through Project Setup, never saved; the picker opens a changeset on a double-click.
- **I2 — `build.ps1` deploys whenever Revit is not running** (`build.ps1:17-26`; Revit is not running now) → the compile gate is a `-p:DeployToRevit=false` loop (Global Constraints, Tasks 4, 6, 9); `build.ps1` is D-1's only.
- **Trust 3 — a mesh from the machine credential was kept** → the bridge keeps `{mesh_sha256, why}` and measures that wall as filed (decision 5; pinned in (f)); the drill records who Revit is signed in as.
- **Trust 4, 11 — the overlay's role** → a signed-in contributor; the machine credential is a 403 (decision 10; (i); the design's roles row). This also removes the uncounted local loop on the slot.
- **Trust 5 — IDS-rejected creates opened ticked** → Revit-only clause `el.Verdict?.Status != "rejected"` (decision 2; pinned); open question 1 now asks about the bridge-wide variant. R-2 expects the drill's walls unticked and the level ticked.
- **Trust 6 — the licence check failed open** → `view_reference !== true` (pinned with the key false and absent); a Risks line; a pin that the points reach the crosses only.
- **Trust 7 — a posted `reread` was not pinned as dropped** → (f) posts one and expects none.
- **Trust 8 — the 512 cap** → 64 on both sides, with the body's arithmetic in decision 4.
- **Trust 9 — `mesh_sha256` is the bridge's serialization** → said in decision 5; `PackMesh` never writes `-0` (pinned).
- **Trust 10 (YAGNI)** → one `why` (no `refused`); no `reread.triangles`; the constructor's `tris` left as it is (decision 11).
- **M1 — an untick could lose the race with the draw job** → `ScanOff` is a hub job; `scanOn` lives on Revit's thread only (pinned); an answer to an older tick is dropped.
- **M2 — a fast re-tick meets the slot's 409** → R-3 waits for the Scan line; the 409 is said in the window.
- **M3 — `thin`'s doubling had no end below 8 points** → `read_cloud` asks `max_points` 8 to 100 000 (pinned with 7).
- **M4 — the overlay's refusals said "nothing was saved"** → re-worded to "— its scan is not shown" (pinned in (i)).
- **M5 — unticking wiped the ghost line** → unticking shows `Line(creates, outlined)` again (none after Apply).
- **M6 — two comments said a create is never pre-ticked** → `ChangesetReviewWindow.cs:278` and `Claimed`'s doc updated; a pin that the window's comment no longer says it.
- **M7 — `git status` and the commit counts** → Task 0 commits the plan; Task 6 expects six commits, Task 11 four.
- **M8 — R-4's head depends on who Revit reports as** → R-2 checks Standards ▸ Sign in and records who; R-4 records the head as it appears.

Rejected:
- **Trust 5's bridge-wide fix as the default** (`pretick &&= verdict.status !== "rejected"` at filing) — it changes MA-4d's shipped desk, its "N pre-ticked" reply and tests, and every Promote retype or attach pre-tick: outside this slice. Kept as open question 1's alternative; Revit's clause is one line.
- **Keeping the machine credential on the overlay** (Trust 4's second option) — refusing it matches every other sentinel-survey run and removes Trust 11's uncounted runs; the drill's positive read moves to a signed-in Revit and its numbers to an in-memory run (MA4f-2 V-1).
- **Re-wording the slot's 409 in the window** (M2's option) — the bridge's words already arrive re-worded ("— its scan is not shown"); the drill waits instead.

## Open questions (the founder's to decide; the defaults above are built unless overruled)

Decided defaults, not questions: two sub-slices, 4f-1 first (1); Revit ticks the bridge's pre-ticked, measured survey creates the IDS did not reject (2); the re-read at Apply, walls only, the add-in's claim, a person's report only (3-5); the bridge reduces it, bounded by the filed wall, and the service is unchanged (6); the verify row is claimed when it rests on the re-read (7); the overlay is the bridge's view from the job's own cloud, a signed-in contributor, no row (9-10); crosses, 5 000 points, a tick in the review window (11).

1. **The IDS verdict and the pre-tick.** Default (the safe one): Revit never pre-ticks a create the office IDS rejected (one clause in `PreTick`) — so on `ma4c-drill`, where every survey wall's badge reads `✗ rejected (1)`, the walls open unticked and only L01's created level opens ticked; the bridge's `pretick` and the web desk are unchanged. Alternatives: make the bridge's `pretick` read the verdict at filing (web and Revit together; MA-4d's reply counts and tests change, and so do Promote's retype/attach pre-ticks), or let Revit follow the bridge's `pretick` alone (IDS-rejected walls open ticked; Apply's IDS stage asks).
2. **Pre-tick on deviation.** Default: no — the pre-tick stays on the fit (your MA-4d answer); a deviation is measured after placement. Alternative: a pre-placement deviation per candidate at job time (a service change and a new job version).
3. **A wall moved after Apply.** Default: not seen in MA-4f (the re-read is Revit's at Apply; said on the desk). Alternative: a "re-read for verify" action in Revit next.
4. **The overlay's reach.** Defaults: a signed-in contributor (the machine credential is a 403, like every sentinel-survey run); 5 000 points at 100 mm in one buffer; a plan or a section box that does not clip it is recorded, not fixed. Alternatives: any member (viewer), or the machine credential from this PC (its runs uncounted on the shared slot); chunked, denser buffers; clipping with `DrawContext.GetClipPlanes`.
5. **The re-read's bounds.** Default: each side within 1.5 × the filed thickness of the line, ends within a thickness and 100 mm, height within 100 mm. Alternatives: tighter (a side within half a thickness of the filed face — a finish-face location line then reads as filed), or none (the claim alone, said so).
