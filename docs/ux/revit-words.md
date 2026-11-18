# Revit words (UX slice 4, design, 2026-11-18)

Slice 3 put plain words on the web. This slice does the same in Revit: ribbon tooltips, the Sentinel pane, the
windows, the message boxes, and the F1 help. The rules are the same as `web-words.md`; this page lists only what
is different in Revit.

Nothing is removed. A word changes; a code or number that is hidden moves into "Details" and stays readable. The
engine, what Revit stores in the model, and what is sent to the web stay as they are. The file-by-file list is
`revit-words-files.csv` (102 files: 51 screen, 30 mixed, 21 leave alone; in a mixed file the note says which lines are which, and
"verify" marks a line whose path to a stored record the implementer must check first).

## 1. The words (only what `web-words.md` does not already say)

| Today in Revit | On screen | Notes |
|---|---|---|
| Federation Gate: PASS / FAIL / NOT CHECKABLE / NOT RUN | **Coordination check: Passed / Failed / Cannot be checked / Not run yet** | Same name as the web and the journey hints. "run it on the web before clashing" becomes "run it on the web (Models) before raising clashes". |
| Governed Publish (in sentences) | **Publish** | "run Governed Publish again" becomes "publish again". The button name: open point 1. |
| IFC Delivery Gate, delivery gate, gate row | **Pre-publish check** | "contract", "contract@n" become "pre-publish check rules"; the version goes to Details. |
| referee ("waiting for the referee", "referee-raised") | **Sentinel** / "the check" | "Only issues Sentinel raised from the data requirements can be fixed here." |
| governed call | "what Revit sends to Sentinel" | Sign in: "Everything you send from Revit then carries your name in History." |
| verdict, adjudication | **result**, **check** | accepted / rejected / "recorded, not checked". |
| ruleset (what Scan Now judges by) | **Project standards** (one is a **rule**) | Same word as the web (decided 2026-11-18: one name for one thing across Revit and the web). "ruleset@n", source and sha go to Details. "ruleset 'org' is empty" becomes "the office code is not set in the Project standards". |
| changeset (Review AI Proposals, Applied AI Changes, Build tools) | **proposed changes**; countable "set(s) of proposed changes" | "revert" becomes "undo". "filed" becomes "sent for review". |
| ledger, "ledger #812 · receipt 3f9a…", "sent to the ledger" | **History**, "Recorded in History" | The number and receipt go to Details. Action codes (`changeset_confirmed`, `mep_check`) too. |
| DD IDS | **DD data requirements** | "made from the LOD matrix" stays. |
| CDE-01 and other rule codes inside a sentence | the plain reason first | "Sync stopped: the file name does not follow the naming standard." The rule code goes to Details. In lists (the pane's Rule column, Naming Manager) the code stays: it is the rule's name. |
| registered in the CDE | "added to the project's files" | |
| Container naming convention (ISO gap list) | **File naming convention** | The clause reference "ISO 19650-2 container ID" stays; it is ISO's own word. |
| "Bridge 409: …", "the bridge answered HTTP 500", "bridge unreachable" | see `web-words.md`, "When Sentinel is not connected" | The status code and the technical cause go to Details. |
| "Start the bridge (npm run bcf:serve)" | "Ask your administrator to start Sentinel on the office PC." | The command goes to Details. |
| token, shared machine token (Sign in, Project Setup) | hidden | "Signed out. This PC's shared access is used, and History records this PC's name, not yours." |
| "Standards ▸ Sign in", "Sentinel ▸ Project Setup", "Coordinate ▸ …" (about 60 places) | **More ▸ Sign in**, **More ▸ Project Setup**, … | The old panel names are gone since slice 1. Every path follows `ribbon-coverage.md`. |
| web places named from Revit ("BIM Tools → Views tab", "the web desk", "Holding Area") | the slice 2 names | From `web-coverage.md`. "Holding Area" becomes "Waiting for approval". |

Words that stay in Revit: Ghost Builder, Promote (DD), Scan Now, Doctor (names of tools and of the pane's log);
IFC, BCF and .ids on import, export and file pickers ("BCF 2.1 — for ACC"); LOD; Revit's own words (workset, type,
Undo, Toposolid); "token" in a naming pattern.

### PC Settings (a BIM manager's screen)

The manager must still see and type real values here, so they stay visible, with plain labels:

| Today | On screen |
|---|---|
| Bridge and sign-in | **Connection and sign-in** |
| Bridge address | **Sentinel service address** (the address itself stays visible, e.g. `http://localhost:4100`) |
| This PC's shared token | **This PC's shared access code** (still a hidden box) |
| "✓ The bridge at … answers" / "✗ No bridge answers at …" | "✓ Sentinel answers at …" / "✗ Nothing answers at …. Is Sentinel running on that PC?" |
| "works only with the bridge on this PC (PR-1)" | "works only when Sentinel runs on this PC"; the code PR-1 goes away |

Sign-in address and key, local AI address and models, and the folders keep their labels. In the Sign in window the
line "Signs in at … · bridge …" goes into Details.

## 2. What is not changed in Revit, and why

Sections 2.1 to 2.5 of `web-words.md` apply. In Revit that means:

1. **Text Revit sends that gets recorded.** The note and reason on proposed changes and on each row ("kept as it
   stands …", "sent to a person …", "not filed: …"); the reason typed for an undo; the author name "Governed
   Publish" / "Auto-Publish"; notes such as "fix-in-place check · BCF <id>"; the comment written on an issue after a
   fix (it contains "ledger row: ledger #…"); issue titles (`IDS: <requirement> (n failing)`, which Revit also
   reads back); the pre-publish certificate file (`issued_by: "Sentinel IFC Delivery Gate"`) and the values of
   History rows.
2. **Names Revit or files keep.** Undo names ("Sentinel AI changeset: <name> [id]" is read back from Revit's Undo
   list), background operation names, stored-data and shared-parameter names, family, type, view and sheet names
   Sentinel writes, file names and file headers, ribbon ids (`Sentinel_*`), command class names, settings keys.
3. **Markers the add-in itself reads.** A sentence that other code tests must change in both places or not at all:
   - `"Bridge <code>: …"` built in `ChangesetClient.cs:524`, tested in 7 places (`Commands.ReviewChangesets.cs:274`,
     `SavedCheck.cs:167`, `UnreportedResults.cs:137,303`, `GhostChangesetBuild.cs:586,588`,
     `PropertyPlanner.cs:511,556`, `TerrainPlanner.cs:161`). **Keep it as the internal value**; translate only where
     it is shown (the helper in section 3).
   - `"Ruleset:"` lines of `StandardsBuilder.cs` tested by `Commands.Standards.cs:364,378`.
   - `": no DD row in the LOD matrix"` (`LodState.cs:222`), `"the built-in"` (`Commands.Protection.cs:138`),
     `", one Undo)"` (`StoreyBatch.cs:106` and `ChangesetReviewWindow.cs:278`), `"unsigned"`
     (`ProvenanceStamp.cs:204`), `"storey "` (`PromoteContext.cs:149`), `"wall type Function"`
     (`FixInPlaceService.cs:344`).
4. **Sentences from the web that Revit reads.** Three, all still matching after slice 3 (checked):
   `TerrainPlanner.cs:161` reads "elements[n]: changeset <id> (applied) holds this scan —" (bridge
   `changesets-logic.mjs:882`); `PropertyPlanner.cs:471,511` read `elements[k]` and `set_parameter`. These bridge
   sentences must not be reworded later without changing Revit too. One small flaw found: `IssueDraft.cs:90` tests
   for an ending "nothing was saved"; slice 3 wrote some endings as "Nothing was saved." so the phrase can appear
   twice. Make the test ignore case and the final full stop.
5. **Checks that quote the text.** 37 files under `tools/*-check` read the add-in's source or quote its sentences
   (`promote-check`, `gate-check`, `publish-check`, `roi-check`, `pane-layout-check`, `event-check` …). When a quoted
   sentence changes, the quote changes with it; nothing else in a check is touched. `tools/ribbon-coverage/check.py`
   pins command class names only, so new labels do not break it.

**Rule for implementers, every string:** search its first distinctive words in `SentinelAddin`, `tools` and
`WebApp/bridge`. If code compares it, parses it or posts it in a request body, leave it and note it. If unsure
whether it is posted, treat it as posted.

## 3. How Details are shown in Revit

| Where | Details |
|---|---|
| Message box (TaskDialog) | `ExpandedContent`, Revit's own "Show details" fold. Headline and body are plain; History number and receipt, versions (`ruleset@7`), sha256, HTTP status, rule codes, addresses and commands go in the fold. |
| Sentinel pane | The existing closed "Details" fold under the Next strip holds the standards' versions. The Doctor log is the pane's own record (open point 2). |
| Windows built in code | One closed `Expander` with the header "Details", as `JourneyWindows.cs:124` already does. Move that into one shared helper and use it in the Review, Applied AI Changes, Issues, Sign in and standards windows. |
| One-line status texts | Plain words only; the full line is also written to the Doctor log. |

Code added beyond wording, all small: (a) a display twin of `LedgerLine.For` that returns "Recorded in History"
plus the detail text (`For` itself stays, because its text is written into issue comments); (b) one function
that turns an internal `"Bridge <code>: …"` error into the plain sentence plus detail; (c) reading the bridge's
new `detail` field beside `message` (`ChangesetClient.cs:521` reads only `message` today, so the hints slice 3
moved into `detail` are lost in Revit).

**F1 help.** `content.json` gets the same words. Where the help quotes a sentence from the screen, the quote must
equal the new sentence. 20 steps still say "in the Coordinate panel" / "in the Validate panel"; they become the
7-button paths. Entry keys (`Sentinel_*`) and the `sources` lists do not change. Then run `tools/help/build.py`
and commit the pages.

## 4. Decisions (2026-11-18, taken on the recommendations; the founder can change them before merge)

1. **Names of the tools inside the menus.** Rename only the four that are jargon: Governed Publish → **Publish
   model**, IFC Delivery Gate → **Pre-publish check**, Rule Set → **Project standards**, BCF Issues → **Issues list**
   (window title "Sentinel — Issues"). Keep "Review AI Proposals" and "Applied AI Changes": they are already plain
   and about 40 messages point to them by name. Internal button ids (`Sentinel_*`) and F1 keys do not change.
2. **The Doctor log in the pane.** Plain words there too (Sentinel, History, proposed changes), but History numbers
   and action codes stay in its lines: the Doctor log is the pane's Details.
3. **"ghost".** Not in the approved glossary: left as it is in this slice (a later pass if the founder wants
   "proposed element"). "Referee" becomes Sentinel (above).
