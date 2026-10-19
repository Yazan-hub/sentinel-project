# Apply claim, retry-safe result, two-office isolation, a revert's own save — design (2026-10-20)

Closes the last integrity gaps of the 2026-10-19 evaluation's "Immediate" list (§4B2 gap 2, §4B3 rows 2–3) and the revert spec's own
limit ("a revert's own persistence is not checked", 2026-10-20-revert-and-persisted-design.md). Approved as a batch by the founder; no design gate.

## 1. Apply claim (two Revit sessions never apply one changeset twice)

**Bridge:** `POST /changesets/:key/:id/claim {session, pc}` — a contributor or above (the machine credential passes, as for the result).
One conditional update through the store's own compare-and-set (`rewrite`, swapped on `review_rev`, which every write bumps — the same
guarantee as `WHERE status = 'proposed'`, and the idiom every changeset write already uses since MA-3a). The changeset must be
`proposed`; a live claim (its `until` in the future) by another session is a **409 in words**: `"<name>" is being applied by <who> on
<pc> (since hh:mm UTC) — nothing was changed; try again when they finish, or after hh:mm UTC`. Otherwise the doc gets
`claim: {session, by, pc, at, until}` (TTL 30 minutes; the same session re-claims and refreshes it). No ledger row: a claim changes no
model and no decision; the result row already names who applied.

Recommendation taken over the evaluation's `staged → applying` status: a new status would have to be taught to every reader (web desk,
MCP status, Revit's list `?status=proposed`, withdraw, the review routes) and an expired `applying` would hide a changeset from all of
them. A `claim` field under the same compare-and-set gives the same single-use guarantee and leaves `proposed` meaning proposed.

`POST /changesets/:key/:id/unclaim {session}` drops the caller's own claim (nothing placed: a "Go back", a missing workset, an error
before the transaction). Another session's claim is left as it is.

**Result:** `reportResult` refuses (409) while another session holds a live claim — a Decline all from PC B while PC A is applying is
refused, not recorded over A's placement. The result clears the claim (the changeset leaves `proposed`). Withdraw is refused while a
live claim is held.

**Add-in:** Review AI Proposals ▸ Apply claims every changeset of the batch after the role check and before the transaction, then
re-checks the web's declines on the claim's reply (the latest `review_rev`). A refused claim says the bridge's words and nothing runs;
claims already taken for the batch are dropped. The session id is one GUID per Revit process; `pc` is the machine name.

**Limit (said):** a person who sits on a dialog longer than 30 minutes loses the claim; if another PC claims and applies meanwhile, the
first PC's result is refused with "being applied by …" and kept on this PC (UnreportedResults) — the model shows two placements and
the words say so. Ghost Builder files and applies in one step from the same session and does not claim; its result still refuses
under another session's live claim.

## 2. Retry-safe result (Idempotency-Key)

The add-in's result record gets an `attempt_key` (a GUID made once, kept in the UnreportedResults file, so a retry after a restart
sends the same key). The bridge stores it on `result.attempt_key`. A result whose key equals the stored one answers **200 with the
stored result** (`replayed: true`, its `changeset_applied` row looked up) — never a second record, never a 409 the client must
interpret. Another key on a reported changeset is the 409 it always was. Uniqueness is the doc's write-once result under the
compare-and-set (no database migration).

## 3. Two-office isolation in CI

`WebApp/bridge/two-office-isolation.test.mjs` on a PGlite harness (`pglite-harness.mjs`: a minimal Supabase shim — roles, `auth.uid()`
from `request.jwt.claims` — then every migration in order). Two offices, two projects, two users: signed in as A, every project- or
office-scoped table returns zero of B's rows (and anon none of either), with B's rows proven present; every public table has RLS on (a
new table without it fails CI); key writes into B are refused. Runs in `npm run test`.

## 4. A revert's own save is confirmed

The revert transaction marks each reverted non-create row on the element's provenance stamp (`reverted: ["<changeset>/<guid>"]`,
written inside the revert's own transaction, so Ctrl+Z or closing unsaved takes it away). The add-in keeps a waiting record
(`%AppData%\Sentinel\unsaved\<key>\<id>.revert.json`) with the reverted rows; on DocumentSaved / SynchronizedWithCentral / DocumentOpened
(the same `Decide` table as a changeset) each row is "held" when its element is gone (a deleted create) or carries the mark, else
"missing" (the change came back). Posted as `POST /persisted {of: "revert", how, held, missing}` → one `changeset_revert_confirmed` or
`changeset_revert_lost` row, and the doc's `reverted.persisted {state, how, at, missing}`. held + missing must be exactly the guids the
revert reverted (the doc's `reverted.rows`, stored from now on; a revert recorded before this has none → 409 in words). Ctrl+Z of the
revert takes the mark away with it, and the bridge's redo row clears the doc's `reverted`: the next save posts, the bridge answers 409
("holds no revert") and the waiting record goes by itself (no undo-watcher change). A later changeset's stamp keeps the marks it finds.

Shown: Applied AI Changes' state line adds "revert saved in the model" / "revert NOT in the saved model"; MCP status gives the doc.

## Tests and drill

vitest: claim/unclaim (proposed only, live vs expired, same session refresh, another's refused in words, result and withdraw refused
under a foreign claim, result clears it), attempt-key replay, persisted `of: "revert"`. Revit-free (tools/promote-check): the stamp's
revert mark, the revert record's file and decision. Live on Revit 2024 (scratch copy of prot-b-drill.rvt, bound to ma4c-drill): a second
claim simulated from a second session id while one is held (refused in words), Apply → result clears the claim, a replayed result,
Revert → save → `changeset_revert_confirmed`; Revert → close without saving → reopen → `changeset_revert_lost`.
