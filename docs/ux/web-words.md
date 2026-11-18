# Web words (UX slice 3, design, 2026-11-18)

Rule 2 of the simplification map: no internal words on screen; codes, hashes, `@n` versions and JSON only in a
collapsed "Details". Slice 2 renamed the areas and tabs. This slice changes the words inside the panels: labels,
buttons, headings, hints, status lines and error messages.

Nothing is removed. A word changes; a value that is hidden moves into "Details" and stays readable. The engine,
the database and the history stay as they are. The file-by-file list is `web-words-files.csv`
(132 files: 64 screen, 27 mixed, 41 leave alone).

## 1. The words

| Today | On screen | Notes |
|---|---|---|
| changeset | **Proposed changes** | Countable: "3 sets of proposed changes". |
| apply / revert a changeset | **Apply / Undo** | "reverted in Revit" becomes "undone in Revit". |
| ledger | **History** | "recorded on the ledger" becomes "recorded in History". |
| ledger #n, receipt, chain hash | hidden | The line says "Recorded in History"; the number and receipt are in Details. |
| delivery gate, gate (on a file) | **Pre-publish check** | "passes the delivery gate" becomes "passes the pre-publish check". |
| contract, contract@n (what the gate checks) | **Pre-publish check rules** | One of the Project standards. "Contract name" becomes "Rules name". Version in Details. |
| stage gate (Home, lifecycle) | **Stage check** | A different thing from the pre-publish check: it measures the project before it moves to the next ISO stage. Button: "Check and move to <next stage>". Results: "Ready", "Not ready", "Cannot be checked". |
| Federation Gate, Run gate (Clash) | **Coordination check**, "Run check" | The check across all live models before clashes are raised. "Raise is locked until the coordination check passes". |
| platform gate | **Platform check** | The same pre-publish check, run on That Open. |
| ruleset, ruleset@n | **Project standards**; a single one is a **rule** | "3 rules skipped". Version, source and fingerprint in Details. |
| artefact | **standard** | "IDS artefact" becomes "data requirements". |
| Governed Publish | **Publish** | |
| governed verdict | **check result** | "First governed verdict" becomes "First publish checked". |
| Holding Area | **Waiting for approval** | |
| IDS (the set of requirements) | **Data requirements** | "Install as the project's IDS" becomes "Use as the project's data requirements". "Compile to IDS" becomes "Turn into data requirements". "IDS ✓" becomes "Check data". |
| IDS (the file) | **.ids file** | Stays on "Download .ids", "Load an .ids file" and on messages about reading such a file. |
| ids@n | hidden | Details. |
| MIDP | **Delivery plan** | The whole project's plan. |
| TIDP | **Team delivery plan** | One task team's part of it. The two never share one word. |
| CDE (the place) | **the project's files** / **Folders** | "in the CDE" becomes "in the project's files". |
| container | **file** | "+ Container" becomes "+ New file". |
| WIP / Shared / Published / Archived | **Work in progress / Shared / Published / Archived**, as a badge | The ISO suitability code (S0, S2...) stays beside it; it is a real ISO value. |
| sha, sha256, hash | hidden | Details. A "Verified" badge appears only where Sentinel really compared the file just now. Otherwise no badge. |
| bridge | hidden while it works | See "When Sentinel is not connected" below. |
| token (sign-in) | hidden | "not accepted by the bridge" becomes "Your sign-in was not accepted. Sign in again." |
| BCF topic, BCF issue | **Issue** | BCF stays on "Import BCF", "Export BCF", the version picker and messages about a .bcf file. |
| BCF service (as a source name) | **Issues** | |

Words that stay because they are the thing itself: IFC, COBie, BCF and .ids on import/export/download; ISO 19650;
BEP, EIR; LOD; the suitability and revision codes (S2, P01, C01); "feed key" (the person must copy it into
Power BI; it is already called a key, never a token); "token" in naming patterns (`{level}`, `{n}`), which is a
placeholder, not a sign-in.

### When Sentinel is not connected

A person never reads "bridge". The messages become:

| Today | On screen | In Details |
|---|---|---|
| can't reach the bridge (...) | **Sentinel is not connected.** What was not read, and "Nothing was saved" where true. | the technical cause |
| the bridge answered HTTP 500 / without a list | **Sentinel could not answer.** | the status |
| The bridge refused this (HTTP 403) | **You do not have permission for this.** | HTTP 403 |
| CDE not configured (SUPABASE_URL ...) | **Sentinel's storage is not set up on this installation.** | the setting names and the restart command, for the administrator |
| Start it: `npm run bcf:serve` | **Ask your administrator to start Sentinel on the office PC.** | the command |
| see the bridge log | **The cause is in Sentinel's log on the office PC.** | |
| this bridge / on this bridge | **this installation** | |

## 2. What is not changed, and why

1. **Anything already recorded.** History rows, issues, proposed changes, documents and installed standards keep
   the words they were written with. History is a chain: each row is sealed with the one before it. Rewriting old
   text would break the seal, so it is never done.
2. **Text that is written into a record.** Sentences the engine writes into a History row (action, reason, the
   saved check results), into an issue (title, description, history line, author name such as "Governed Publish"),
   into proposed changes (notes, flags), into an installed standard, or into a text pinned by a fingerprint (the
   drafted letters, the audit pack). Several are read back by the code: the issue title `IDS: <requirement>
   (n failing)` is how Sentinel avoids raising the same issue twice. They stay.
3. **Codes and names the software reads.** Error and refusal codes, API field names, routes, CSS classes, element
   ids, query parameters, file names, stored status codes, the keys of display maps.
4. **Text read by machines or developers.** MCP tool names and descriptions and AI tool descriptions (read by AI
   agents), AI prompts, console and log lines, command-line usage, the offline verifier and the public
   verification client, and body-validation errors that name a JSON field or a route (they answer API clients,
   not people).
5. **Format names where they are the thing** (the list above).

Bridge sentences a person does read count as on screen: the error and refusal messages the web shows from the
bridge's `message`, the lock reasons in Clash, and the step labels and hints of the Next strip, the Guide and the
Revit pane (`journey-logic.mjs`). They are computed when asked, not stored.

**Rule for implementers, every string:** before changing it, search its first distinctive words in `WebApp`
(src, bridge, tests), `SentinelAddin` and `tools`. If non-test code compares, parses or stores it, leave it and
note it. (The web matches two bridge sentences today: `cde-transition.ts` and `workspace-state.ts`.) If unsure
whether a string is stored, treat it as stored. Tests that quote a changed string change with it. `bridge/sentinel-core.mjs`
is generated: edit `src/sentinel-core` and run `npm run build:bridge-core`. Journey hints are read by the
nav-coverage test.

## 3. How hidden values move into Details

One small shared helper, used everywhere: a line of plain words followed by a closed `<details>` labelled
"Details" that holds the value exactly as shown today.

- **History reference.** `ledger #812 · receipt 3fa9…` becomes "Recorded in History", with "History entry 812 ·
  receipt 3fa9…" in Details. Two functions build this line today (`ledgerLine` in `stage-gate.ts` and in
  `platform-deliveries.ts`); most panels call them, so the change is made twice, not sixty times.
- **Fingerprints.** "sha 4be1…" leaves the sentence and goes to Details as "sha256 4be1…". Where Sentinel has
  just compared the file with its record (re-check of evidence, geometry check), the line shows "Verified".
- **Versions.** "ids@7 installed on aster-tower (sha …)" becomes "Data requirements installed", with
  "ids@7 · sha256 …" in Details. The Next strip's "Standards in force" line keeps the names and moves the
  versions.
- **Technical causes and set-up text.** HTTP status, setting names, commands: Details.
- **Bridge messages.** Today the bridge sends one sentence. It gains an optional second field, `detail`, beside
  `message` (old clients ignore it). `bwrite` and `refusalText` in `bridge-fetch.ts` pass it to the helper. This
  is the only code added beyond wording.
- **Where a bridge sentence names a History row and no field carries the number**, the number stays in the
  sentence as "History #812" and the string is listed as a leftover.

## 4. Open points for the founder

1. **Old words inside recorded text.** History entries, automatic issue titles ("IDS: … (3 failing)"), authors
   ("Governed Publish", "Federation Gate") and saved check results are shown as they were recorded, so the old
   words remain visible there. *Recommendation:* accept this for slice 3. Translate on display only the short
   fixed codes that already have a display map (the Waiting for approval list: stage and source). Free text
   stays as recorded. New wording for future records is a separate, engine-level slice.
2. **Three new names not in the approved glossary:** "Stage check" (stage gate), "Coordination check"
   (Federation Gate) and "Pre-publish check rules" (contract). *Recommendation:* approve them as written; they
   keep the three checks apart in plain words.
3. **The auditor's screens** (Settings ▸ Advanced: History verification, audit pack, external timestamp).
   Their purpose is to show receipts and fingerprints to an auditor. *Recommendation:* "ledger" becomes
   "History" there too, but the receipt and fingerprint stay visible; the screen is already under Advanced and
   is itself the Details.
