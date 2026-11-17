# Spike: a Sentinel verdict on every Revit sync through That Open (the "sync gate")

Date 2026-11-16. Status: **spike plan, nothing built.** Recommendation 3 of
`docs/strategy/2026-11-16-sentinel-full-picture-ar.html` (section 9). Facts below come from the documentation inside
`@thatopen/services` 0.35.1 (published 2026-11-08: `docs/revit-collab-quickstart.md`, `docs/flow-architecture.md`,
`docs/recipes-guide.md`, `docs/cli/mcp.md`). None of it has been run with Sentinel.

## Why

On 2026-10-19 the founder's answer 2 said Revit cloud worksharing can only be hosted by Autodesk, so offices that
co-author in the cloud keep that part of ACC. That Open now hosts a Revit central on its platform:

- Revit 2024 to 2027, That Open's add-in 1.3.1 or later. Everyone keeps a local; syncs are queued, so the central
  never diverges.
- **Every sync is a commit.** The add-in writes `revitflow_history.json` and one `revitflow_frag_<N>.frag` per commit
  under `bimterop/revit-<docId>/` in the platform project. A commit has a `guid`, `parents`, who and when; a commit made
  by a recipe carries `kind: "recipe"` and an `origin`.
- That Open's `GitHistoryManager` colours a commit's elements created, modified and deleted.

If Sentinel judges each commit, an office gets co-authoring in Revit **and** a verdict per sync on the ledger, on a
platform that is not Autodesk's. Today Sentinel judges only what is published (Governed Publish, Governed Intake, the
Delivery Gate).

## What the gate would do (target)

For each new commit: read the commit's `.frag`, run the project's installed IDS and naming over its elements with the
same `sentinel-core` as everywhere else, write one `sync_gate` ledger row (commit guid, who synced, the verdict, the
failures, the IDS ref), raise BCF issues for failures as Governed Publish does, and show a line in the CDE board.
It never blocks a sync (Revit worksharing cannot be held by a third party); it **records and flags**. Publishing stays
Governed Publish and the review chain.

Two ways to start it, to be chosen by the spike:

| | A. A third automation on the platform | B. The bridge watches the history |
|---|---|---|
| Trigger | File Uploaded on a new `revitflow_frag_<N>.frag` (if a condition can select those files; the Delivery Gate already uses 2 of the 3 free automations) | Poll `revitflow_history.json` every minute, as `bridge/platform-gate-ledger.mjs` polls gate runs |
| Runs where | A cloud component (512 MB, 60 min, 300 min a month free) | The bridge PC |
| Writes the ledger | Indirectly: the bridge copies the run record, as for the Delivery Gate | Directly |
| Risk | Can a condition tell a commit `.frag` from an IfcFragmenter `.frag`? Are those files visible to automations at all? | The bridge PC must be on |

## The spike, on the founder's PC (one to two days)

Needs: Revit 2024 or later, `npm i -g @thatopen/services@0.35.1`, `thatopen login`, a scratch platform project, a copy
of a small model (not Snowdon's originals).

1. Follow `revit-collab-quickstart.md` Steps 1 to 4 on the scratch project: install That Open's add-in, create the
   central from the copy, open a local, sync twice with one small named change each (rename a wall type, move a door).
2. **With Sentinel's add-in loaded in the same Revit session.** Record: both ribbons load, Sentinel's live scan and
   Sync guard still run on Synchronize with Central, That Open's sync still succeeds, nothing in either log errors.
3. List the project's files with the CLI or the services client: where `revitflow_history.json` and the commit
   `.frag` files live, whether they are ordinary or hidden files, and their names and versions after each sync.
4. Read the newest commit `.frag` in the Sentinel web app (load it as a model) and in Node (`@thatopen/fragments`
   `SingleThreadedFragmentsModel`, untested in Node): can `sentinel-core`'s element adapter read classes, GlobalIds and
   property sets from it, as it does from an IFC-converted `.frag`?
5. In the platform UI, try an automation: File Uploaded, condition on the name or folder of a commit `.frag`. Record
   whether it fires on a sync.
6. Write the results here as a table: each step, pass or fail, evidence.

## Go or no-go

Go when step 2 shows the two add-ins coexist, step 4 reads property sets from a commit `.frag`, and either step 5 fires
or the history file can be polled. Then a design follows (spec, plan, tests, drill), after the lifecycle test P1 to P4
(the freeze of 2026-11-16).

No-go when the add-ins conflict or a commit `.frag` carries no property sets. Then ask That Open (questions in
`docs/THATOPEN_REPORTS.md` section 3) and keep Governed Publish as the only gate on Revit work.

## Not in scope

Holding a sync, writing into the central, replacing Sentinel's changeset path with recipes, or That Open's add-in
running Sentinel's checks. Recipes are noted for later: a recipe's commit carries its origin, which a ledger row could
cite.
