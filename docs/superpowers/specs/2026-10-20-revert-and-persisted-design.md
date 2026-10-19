# Revert a changeset, and "applied, then saved" — design (2026-10-20)

Source: evaluation §1.3 (edge cases 1–3) and §4B3 (the "ledger says applied, document never saved" race). Goal: the "provable" half of
"a person approves and an auditor can verify" — a change can be backed out days later, and the ledger says whether the model kept it.

## What the code holds today (checked)

- An applied row stores only `{proposal_guid, revit_element_id, revit_unique_id}` (+ mesh, tags, as_built). No old value.
- The changeset itself holds each row's "before" for most ops: `retype` → `target.type_before`; `reshape` → `target.placed`;
  `set_parameter` → `from` (always empty: it only fills empty values); `rehost` → `target.at` + `type_before`.
  `attach` does **not** record the wall's old top (only that its base was level +0).
- Every element a changeset touches carries a provenance stamp listing every changeset that touched it (`ProvenanceStamp.Holds`).
  Undo removes it; a file closed without saving never has it. That is an exact, op-free test of "is this change in this file".
- `changeset_reverted` rows already carry `op: undo|redo` and an optional `basis` ("absent"), and every reader (desk, MCP status,
  journey, measure, edit cost) reads a `basis` row as an undo.

## A. Revert changeset (a compensating change)

**Where:** a new **Applied AI Changes** button next to Review AI Proposals (Coordinate panel). It lists the project's applied
changesets, newest first, each with its state (saved / not seen saved / not in the saved model / reverted). Select one → **Revert…**.
Sentinel reads the model (nothing written) and shows: "N rows go back · M kept as they stand: why, per row". The person types a
reason (required) and presses **Revert**. The web shows the state; it never reverts (the web never writes the .rvt).

**Who:** a signed-in contributor or above, in Revit (a person's act, like Apply; the machine credential cannot record one).

**Per row**, reverted only when the element still holds what the changeset set, else kept with the reason (the executor's Kept pattern):

| Op | Reverted when | Goes back to |
|---|---|---|
| set_parameter | the type's value reads `to` | empty, read back |
| retype | its type is the changeset's type, and `type_before` is still in the model | `type_before` (the executor's Unsafe checks again) |
| reshape | it stands on the new line | `target.placed` |
| attach | its base/top are the changeset's levels at +0, **and** the old top was recorded | the old top (recorded from today on) |
| create | its stamp names this changeset, its type and position are as placed, and deleting it removes nothing else (a probe delete; its own tags and other rows of this revert are allowed) | deleted |
| create that replaced a DirectShape, rehost | never | kept: "Sentinel removed the original; it cannot bring it back — a person decides" |

Every row also passes the guards Apply uses: pinned, grouped, design option, borrowed, changed in central (`HeldBy`), and the
**protection policy** (protection@n, else the built-in default) — a protected element is kept, as on Apply.

**Revit:** one transaction, all-or-nothing on errors (GhostFailureHandler), named `Sentinel revert: <name> [id]` = one Undo entry.
The undo watcher knows it: Ctrl+Z of the revert posts a `redo` row (the change is back), Ctrl+Y posts the revert again.

**Ledger:** `changeset_reverted` with `op: "undo"`, `basis: "revert"`, the reverted guids, the kept rows with reasons, the person's
reason. Recommendation: `basis` rather than a new `op: "revert"` — every existing reader already treats it as "not in the model", so
nothing downstream can mistake a reverted row for a live one. Status stays `applied` (as for Undo); the row says what was reverted.
If the post fails, the revert is kept on this PC and sent again when Applied AI Changes opens (the UnreportedResults pattern).

**Attach, from today:** the add-in records the wall's top before the attach on its applied row (`before: {top_level, top_offset_mm}`
or `{height_mm}`); the bridge keeps it field by field. Attaches applied before this ship are kept with "the old top was not recorded".

## B. "Applied, then saved"

**Record:** when the bridge takes a result that applied anything, the add-in writes a small file on this PC
(`%AppData%\Sentinel\unsaved\<key>\<id>.json`: the model, the applied rows). Not in the model (Extensible Storage writes are Undo entries).

**Check** (stamps only, read on Revit's thread, posted off it):
- **DocumentSaved** (not workshared) or **DocumentSynchronizedWithCentral** (succeeded): each waiting changeset of this model → every
  applied row's element is there and its stamp names the changeset → `changeset_confirmed {how: saved|synced}`; any row missing →
  `changeset_lost {how, missing}`. The file goes.
- **Workshared local save:** `changeset_confirmed {how: "saved locally"}`; the file stays until a sync confirms it again.
- **DocumentOpened:** a file still waiting for this model means the last session never saved it (closed without saving, or Revit
  stopped) — the opened file is checked the same way, `how: "reopened"`. This is what catches the crash and the "No" to Save.
- A revert drops the file (the change is no longer meant to be there).
- **Save As** (added after drill REV, row WS-4): Revit raises no DocumentSaved, so DocumentSavedAs moves the waiting files from the
  old path to the new one and checks them there — a central saved under a standard name confirms its changesets.

**Bridge:** `POST /changesets/:key/:id/persisted {how, held, missing}` → one ledger row, and the changeset doc gets
`persisted: {state, how, at, ledger_id}`. The machine credential may post it (an observation, like the undo watcher).

**Shown:** MCP `sentinel_changeset_status` gives `persisted`; the web desk's applied line says "saved in the model (ledger #n)" /
"not in the saved model — closed without saving or Revit stopped (ledger #n)" / "applied — not yet seen saved"; Applied AI Changes
shows the same words.

## Limits (said, not hidden)

- "Unchanged since" for a create is type + position + stamp; a person's other edits (a parameter typed by hand) are not seen.
- A revert's own persistence is not checked (a revert closed without saving comes back on reopening; the ledger still says reverted).
- A PC that never reopens the model never posts the "lost" row; the status then stays "not yet seen saved", which is the truth.
- Two readers treat a partial revert as an undo of the whole changeset (the survey measure button, the journey's LOD staleness) —
  conservative: they ask for a fresh run.

## Tests and drill

Bridge: vitest for the two routes (validation, roles, guids ⊂ applied, rows written, doc `persisted`). Revit-free: the row
decision table and the waiting-file logic in tools/promote-check. Live on Revit 2024 (scratch copy of prot-b-drill.rvt):
apply → Revert (one row kept by a hand edit, one by protection) → ledger; apply → save → confirmed; apply → close without saving →
reopen → lost; Ctrl+Z of a revert → redo row.
