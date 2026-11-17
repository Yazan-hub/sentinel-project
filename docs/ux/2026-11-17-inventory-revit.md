# Sentinel Revit add-in: UI inventory (2026-11-17)

Read-only inventory of `SentinelAddin/` (worktree copies under `.claude/worktrees/` and `obj/` excluded). Method: Grep and scoped line reads. No source file was changed.

Scope notes:
- Ribbon: fully read (`SentinelAddin/App.cs` 451-558).
- Windows: all XAML windows read; code-built windows listed from grep of their control literals (`Content=`, `Text=`, `new Button/CheckBox/...`). Control lists are the literals found, not a full widget-tree walk.
- Not inventoried in detail: about 10 Revit `TaskDialog` prompts (for example `Commands.IfcGate.cs:43`, `Commands.Annotate.cs:144`, `Commands.Massing.cs:107`), and two windows opened from `Commands.Phase2.cs:57,185`, `Commands.Workflow.cs:20,33,46`, `Commands.cs:111`, `Commands.Standards.cs:143,178` that were not traced to their class.
- Jargon counts are grep counts over the UI and ribbon source files. They include code comments and identifiers, so they overstate what a user sees.

## Totals

| Item | Count |
|---|---|
| Ribbon tabs | 1 ("Sentinel") |
| Ribbon panels | 4 (Coordinate, Validate, Publish, Standards & Build) |
| Ribbon buttons (all levels) | 44 = 15 push buttons + 6 pulldown buttons + 23 pulldown items |
| Windows (modal and modeless) | 27 |
| Dockable panes | 1 (`SentinelPanel`, "Sentinel - Live Coordination") |
| Controls | Not counted exactly. About 400 control or label literals across the window sources and the XAML pane (325 matched lines in `UI/` alone) |
| Ribbon buttons that show jargon (user's list) | 20 of 44 |
| Ribbon buttons that are dev-only | 0 (one-time coordinator setup: Review Flag; admin/setup: PC Settings, Sign in, Project Setup) |
| Windows that show jargon | 17 of 27 (see each table) |
| Windows that are dev-only | 0 |

### Jargon words (counts in UI + ribbon source, incl. comments)

User's list:

| Word | Count |
|---|---|
| changeset (incl. changesets) | 41 |
| ledger | 38 |
| gate | 20 |
| IDS | 9 |
| JSON | 21 |
| sha / sha256 | 13 |
| version | 13 |
| ruleset@n | 10 |
| contract@n | 1 |
| artefact | 1 |
| MIDP | 0 |
| hash / hashes | 0 |

Other project terms seen (not on the user's list): IFC 41, BCF 29, bridge 54, token 20, workset(s) 40, ghost 35, CDE 36, schema 11, LLM 6, Ollama 1, LOD 5, DWG 3, config.json 6, `publish@n` (shown in the Publish tooltip), `%AppData%` (4), `ZZZ_ReviewStatus` (parameter name, 1).

### Arabic and mixed-language text

- No Arabic in any XAML window or window builder in `UI/`.
- Arabic is shown to the user as scan and check messages: `Engine/IfcPreFlightScanner.cs:123` (IfcExportAs default warning), `Engine/CdeSyncGuard.Judge.cs:35` and `:45` (file name vs naming convention and project code).
- `UI/RulesetWindow.xaml` binds `{Binding MessageAr}` beside `{Binding MessageEn}`, so every rule message is bilingual, from the ruleset data.
- Everything else in the UI is English, with symbols (⚡, ↻, ✓, ✕, →, ▸, ▶, ⚠).

---

## (1) Ribbon

Tab: **Sentinel** (`App.cs:453-454`). Kind: Push = push button, Pulldown = pulldown button, Item = command inside a pulldown. "Jargon" uses the user's list plus BCF and IFC where clearly relevant.

### Panel: Coordinate

| Panel | Button label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|---|
| Coordinate | Show Panel | Push | Opens the live coordination pane | Modeller, reviewer | No | App.cs:460 |
| Coordinate | Change Requests | Push | Approve or reject pending change requests (keep, apply a Fix, revert) | Coordinator, BIM manager | No | App.cs:462 |
| Coordinate | BCF Issues | Push | Review issues raised on the web; zoom to element | Coordinator, modeller | No (BCF) | App.cs:464 |
| Coordinate | Clash | Pulldown | Groups Clash Manager and Clash Register | Coordinator | No | App.cs:466 |
| Coordinate | Clash Manager (item of Clash) | Item | Native clash detection with severity, 3D view, BCF export | Coordinator, modeller | No (IFC, BCF) | App.cs:468 |
| Coordinate | Clash Register (item of Clash) | Item | Read-only team clash register from the web | Reviewer | No | App.cs:470 |
| Coordinate | Review Flag | Push | One-time: creates the `ZZZ_ReviewStatus` parameter | BIM manager (once) | No (parameter name shown) | App.cs:472 |
| Coordinate | Review AI Proposals | Push | Review staged AI element proposals; tick what enters the model | Modeller, reviewer | Yes: "audit-chained" (not on list) | App.cs:474 |
| Coordinate | Applied AI Changes | Push | See applied AI changesets, revert row by row with reason | BIM manager, reviewer | **Yes: changeset, ledger** | App.cs:476 |

### Panel: Validate

| Panel | Button label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|---|
| Validate | Scan Now | Push | Full compliance scan against the active ruleset | Modeller, BIM manager | No | App.cs:481 |
| Validate | Health Scorecard | Push | Weighted compliance score by domain | BIM manager | No | App.cs:483 |
| Validate | Rule Set | Push | Shows the ruleset this document is judged by, with sha | BIM manager | **Yes: ruleset@n, sha** | App.cs:485 |
| Validate | IFC Gate | Pulldown | Groups IFC Pre-Flight and IFC Delivery Gate | BIM manager | **Yes: IFC, gate** | App.cs:487 |
| Validate | IFC Pre-Flight (item) | Item | Audit export mappings and required properties before IFC export | BIM manager, modeller | No (IFC) | App.cs:489 |
| Validate | IFC Delivery Gate (item) | Item | Export and certify an IFC against the contract; FAIL = do not upload | BIM manager | **Yes: gate, contract@n, sha, schema** | App.cs:491 |
| Validate | Family Health | Pulldown | Groups family audit and heal | BIM manager, modeller | No | App.cs:493 |
| Validate | Sanitize .rfa (item) | Item | Audit an .rfa before loading | Modeller | No | App.cs:495 |
| Validate | Heal Loaded Families (item) | Item | Inject missing shared parameters, reload families | Modeller, BIM manager | No | App.cs:497 |
| Validate | MEP Openings | Push | Find MEP vs structure intersections; place void families | Modeller (MEP) | No | App.cs:499 |
| Validate | MEP Type Check | Push | Check MEP types against the catalogue; ledger row; optional BCF file | Modeller (MEP), BIM manager | **Yes: ledger** (BCF) | App.cs:501 |
| Validate | Naming Manager | Push | Review family and type names against naming rules; one ledger row per batch | Modeller, BIM manager | **Yes: ledger** | App.cs:503 |

### Panel: Publish

| Panel | Button label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|---|
| Publish | Governed Publish | Push | The one governed path: IFC export, delivery gate, IDS and naming adjudication, one versioned container, ledger row | BIM manager | **Yes: gate, IDS, version, ledger** (IFC, BCF) | App.cs:508-509 |
| Publish | Publish | Pulldown | Groups sheet and view publishing (outside governed IFC path) | Modeller, BIM manager | **Yes: publish@n, ledger** (IFC, Bridge) | App.cs:510-511 |
| Publish | Publish Sheets (item) | Item | Render sheets to PNG for the web Sheets tab | Modeller | No (Bridge) | App.cs:512-513 |
| Publish | Publish Views (item) | Item | Choose views for the web Views tab | Modeller | No | App.cs:514-515 |

### Panel: Standards & Build

| Panel | Button label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|---|
| Standards & Build | Standards | Pulldown | Groups project setup, standards pack, documents, guideline, IFC mapping, PC settings | BIM manager | No (standards pack) | App.cs:519-520 |
| Standards & Build | Project Setup (item) | Item | Bind model to its web project, template path | BIM manager (once) | **Yes: IDS, ruleset** | App.cs:521-522 |
| Standards & Build | Sign in (item) | Item | Sign in so writes carry your name on the ledger | All Revit users | **Yes: ledger** (token in tooltip: "shared token") | App.cs:523-524 |
| Standards & Build | PC Settings (item) | Item | Per-PC bridge, token, sign-in, AI, Ghost folders | IT / admin, one PC | No (bridge, token, keys) | App.cs:525-526 |
| Standards & Build | Build Office System (item) | Item | Extract worksets and shared parameters from a golden model, build them | BIM manager | No | App.cs:527-528 |
| Standards & Build | Apply Standard (item) | Item | Load a saved standards pack into the model | BIM manager | No | App.cs:529-530 |
| Standards & Build | Ingest Docs (item) | Item | Extract standards from documents with a local LLM (Ollama) | BIM manager | No (LLM, Ollama) | App.cs:531-532 |
| Standards & Build | Modelling Guideline (item) | Item | Edit the office modelling guideline (families, types, sheets, worksets) | BIM manager | **Yes: ledger** | App.cs:533-534 |
| Standards & Build | IFC Export Mapping (item) | Item | Edit IFC property sets for the exporter | BIM manager | **Yes: IFC, ledger, ifc_export version** | App.cs:535-536 |
| Standards & Build | Protection | Push | What no changeset may edit (grids, levels, worksets) | BIM manager | **Yes: changeset, ledger** | App.cs:537-538 |
| Standards & Build | Model from Drawings | Pulldown | Groups the datum, model, annotate and promote chain | Modeller, BIM manager | **Yes: LOD, DWG** | App.cs:539-540 |
| Standards & Build | 1 · Datum from Drawings (item) | Item | Levels and grids from imported drawing layers | Modeller | No | App.cs:541-542 |
| Standards & Build | 2 · Ghost Builder (item) | Item | Build LOD 200 geometry from a DWG; LLM for unmapped layers; each named with sha | Modeller | **Yes: sha, LLM** (LOD, DWG) | App.cs:543-544 |
| Standards & Build | 2b · Photo Massing (item) | Item | Estimate a mass from photos; file one changeset for review | Modeller, architect | **Yes: changeset** | App.cs:545-546 |
| Standards & Build | 2c · Shell a Mass (item) | Item | Shell a mass into walls, floors and roof; one changeset per storey | Modeller | **Yes: changeset** | App.cs:548-549 |
| Standards & Build | 3 · Annotate Views (item) | Item | Plan WIP views and pins from the guideline; one undo entry; ledger row | Modeller | **Yes: ledger** | App.cs:550-551 |
| Standards & Build | 4 · Promote (DD) (item) | Item | Retype walls, floors, doors and windows to DD by the catalogue; changeset per storey | Modeller | **Yes: changeset, ledger** (LOD, DD) | App.cs:552-553 |
| Standards & Build | 5 · Provenance (item) | Item | Read source, sha256, layer, rule, approver, ledger row of an element | Modeller, reviewer | **Yes: sha256, ledger** | App.cs:554-555 |
| Standards & Build | ROI Dashboard | Push | Counts of gate runs, renames, heals priced by the ROI standard | BIM manager | **Yes: ledger** | App.cs:556-557 |

Ribbon totals: 15 push (top-level), 6 pulldown, 23 items; 20 buttons show a jargon word from the user's list (counting parents).

---

## (2) Windows and the pane

Column "Control" lists the controls found. Kind is the WPF or Forms type. "Jargon" = words from the user's list shown on that window; other project terms in brackets.

### Dockable pane: Sentinel - Live Coordination

Source: `UI/SentinelPanel.xaml` (UserControl), `UI/SentinelPanel.xaml.cs:9`, registered `App.cs:50`. Opened by ribbon Show Panel.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Refresh | Button | ↻ (tooltip: refresh journey from web) | Reloads journey (read-only) | All | No | SentinelPanel.xaml:10-12 |
| Journey block | ScrollViewer + 6 TextBlocks | bound: JourneyKey, StandardsLine, NextLine, LodLine, PublishLine, ScanRulesetLine | Project journey summary | All | No (LOD, ruleset) | SentinelPanel.xaml:17-35 |
| Score | TextBlock | ScoreText (bound) | Compliance figure | All | No | SentinelPanel.xaml:40 |
| Status | TextBlock | Status (bound) | Last status line | All | No | SentinelPanel.xaml:42-43 |
| Doctor | Expander + ListBox | DoctorHeader; DoctorLog | Revit Doctor log | BIM manager, dev | No | SentinelPanel.xaml:47-62 |
| Violations | DataGrid | cols: ⚡ Fix (button per row), Rule, Mode, Element, Message, Ref | Rule violations; double-click to select | All | No | SentinelPanel.xaml:65-112 |
| ⚡ Fix | Button (grid cell) | "⚡ Fix" | Rename element to naming schema, or file a proposal for REQUEST rules | Modeller | No | SentinelPanel.xaml:77-81 |

### Window: Change Requests (RequestsWindow)

File: `UI/RequestsWindow.xaml` (+ `.xaml.cs:32`). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | TextBlock | Change Requests | Heading | All | No | RequestsWindow.xaml:10 |
| SubHeader | TextBlock | (read-only notices) | Role or error status | All | No | RequestsWindow.xaml:11 |
| Request list | ItemsControl | per row: PENDING, Category, RuleId, OldValue → NewValue, by / when | List of pending requests | Coordinator | No | RequestsWindow.xaml:16-48 |
| Show | Button | Show | Select element in model | Coordinator | No | RequestsWindow.xaml:53-54 |
| Approve | Button | ✓ Approve | Keep change or apply Fix | Coordinator | No | RequestsWindow.xaml:55-57 |
| Reject | Button | ✕ Reject | Revert change or drop proposal | Coordinator | No | RequestsWindow.xaml:58-60 |

Jargon: No (RuleId only). Dev-only: no.

### Window: Clash Manager (ClashManagerDialog)

File: `UI/ClashManagerDialog.xaml` (+ `.xaml.cs:7`). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | TextBlock | Clash Manager | Heading | Coordinator | No | ClashManagerDialog.xaml:10 |
| SubHeader | TextBlock | (count, scope) | Status line | Coordinator | No | :11 |
| Severity key | TextBlock x3 | HARD, MEDIUM, SOFT | Legend | Coordinator | No | :18-26 |
| Show element | Button | Show element | Select host element | Coordinator | No | :34 |
| Export BCF | Button | Export BCF | Writes BCF file | Coordinator | No (BCF) | :35 |
| Create 3D clash view | Button | Create 3D clash view | Creates 3D view | Coordinator | No | :36-37 |
| Grid | DataGrid (read-only) | Severity, Host element, Category, Host ID, MEP element, Link, Location, Vol m³ | Clash rows | Coordinator | No | :41-52 |

Jargon: No. Dev-only: no. Note: "Host ID" is a Revit element id.

### Window: Ruleset (RulesetWindow)

File: `UI/RulesetWindow.xaml` (+ `.xaml.cs:8`). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Header / SubHeader | TextBlock | {Header}, {SubHeader} (bound) | Ruleset name, source, sha | BIM manager | **Yes: sha** (ruleset) | RulesetWindow.xaml:27-29 |
| Mode legend | TextBlock x4 | MONITOR, WARN, REQUEST, BLOCK | Enforcement modes | BIM manager | No | :38-50 |
| Rule list | ItemsControl | Mode, Id, Target, DocRef, Pattern, MessageEn, MessageAr, ExtraInfo | Each rule | BIM manager | No (Arabic message bound) | :73-108 |

Jargon: sha (and "ruleset"). Dev-only: no. Arabic: MessageAr is data-driven.

### Window: Sign in (SignInDialog)

File: `UI/SignInDialog.xaml` (+ `.xaml.cs:14`). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | TextBlock | Sign in | Heading with explanation (name on every governed call) | All | No | SignInDialog.xaml:10-11 |
| WhoText | TextBlock | (signed-in person) | Current account | All | No | :17 |
| E-mail | TextBox | E-mail | Account email | All | No | :20-21 |
| Password | PasswordBox | Password | Account password | All | No | :23-24 |
| StatusText / WhereText | TextBlock | (errors; where it signs in) | Status, sign-in host | All | No | :28-29 |
| Sign out | Button | Sign out | Forget sign-in on this PC | All | No | :32 |
| Close | Button | Close | Close | All | No | :33 |
| Sign in | Button | Sign in | Sign in | All | No | :34-35 |

Jargon: No. Dev-only: no. Note: the tooltip on the ribbon item mentions "shared token".

### Window: Project Setup (SettingsDialog)

File: `UI/SettingsDialog.xaml` (+ `.xaml.cs:13`). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Project code | TextBox | (optional, e.g. BDS20268) | Tightens CDE file-name check | BIM manager | **Yes: CDE** (ruleset-style terms in header: ruleset, IDS, naming) | SettingsDialog.xaml:17-19 |
| Web project | ComboBox | Loading projects from the bridge… | Pick web project to publish to | BIM manager | **Yes: bridge** | :23-28 |
| Scope note | TextBlock | (scope warning) | Scope note | BIM manager | No | :30 |
| Ghost source folder | TextBox + Browse… button | Browse… | DWG and spec folder | BIM manager | No (DWG in label) | :33-38 |
| Revit Doctor axis fix | CheckBox | (text: let Revit straighten off-axis lines) | Doctor setting | BIM manager | No | :43-45 |
| Save scope | RadioButton x2 | Current project (Extensible Storage…); This machine only (%AppData%\Sentinel\config.json…) | Where settings are saved | BIM manager | **Yes: config.json (file path)** | :51-56 |
| Who / status | TextBlock x2 | (signed-in, saved message) | Status | BIM manager | No | :61-62 |
| Cancel | Button | Cancel | Close | BIM manager | No | :65 |
| Save | Button | Save | Save | BIM manager | No | :66-67 |

Jargon: CDE, bridge, config.json. Dev-only: no. Note: in the code, Project Setup lives on the ribbon's Standards pulldown.

### Window: Review Fix (FixReviewDialog)

File: `UI/FixReviewDialog.xaml` (+ `.xaml.cs:12`). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Header / Rule | TextBlock x2 | "Review fix for '…'" / rule text | Element and rule | Modeller | No | FixReviewDialog.xaml:10-11 |
| Current value | TextBox (read-only) | Current value | Current name | Modeller | No | :15-16 |
| Proposed value | TextBox (editable) | Proposed value (editable) | New name | Modeller | No | :19-20 |
| Validity | TextBlock | (check result) | Validation message | Modeller | No | :23 |
| Cancel | Button | Cancel | Close | Modeller | No | :25 |
| Execute fix | Button | Execute fix (or File proposal for REQUEST) | Apply or file | Modeller | No | :26-27 |

Jargon: No. Dev-only: no.

### Window: Publish Views (ViewPickWindow)

File: `UI/ViewPickWindow.cs:20` (code-built). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Header | TextBlock | Only checked views appear in the web Views tab… | Explains | Modeller | No | ViewPickWindow.cs:37-39 |
| Select All / Select None | Button x2 | Select All, Select None | Bulk tick | Modeller | No | :43-44 |
| View rows | CheckBox + TextBlock per view | view name | Choose views | Modeller | No | :94-100 |
| Status | TextBlock | (status) | Status | Modeller | No | :51 |
| Publish | Button | Publish ▶ (default) | Publish | Modeller | No | :53 |
| Cancel | Button | Cancel | Close | Modeller | No | :54 |

Jargon: No. Dev-only: no.

### Window: Build Office System (StandardsReviewWindow)

File: `UI/StandardsReviewWindow.cs:17` (code-built). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | Window | Build Office System | Heading | BIM manager | No | StandardsReviewWindow.cs:46 |
| Report | TextBox | (proposal text) | Proposed standard | BIM manager | No | :54 |
| Status | TextBlock | … | Status | BIM manager | No | :53 |
| Item rows | CheckBox + TextBlock + badge per item | item label, confidence badge | Tick what to build | BIM manager | No (golden model in code) | :150-201 |
| Action buttons | Button (factory `b`) | Build and others | Build, close | BIM manager | No | :98 |
| Header | TextBlock | Proposed office standard — tick what to build, then Build. | Explains | BIM manager | No | :77-79 |

Jargon: No visible. Dev-only: no.

### Window: Choose changeset (ChangesetPickerWindow)

File: `UI/ChangesetPickerWindow.cs:15`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Summary | TextBox (read-only) | Loading… | List of changesets with blocked notes | Reviewer | **Yes: changeset** | :21 |
| Row text | TextBlock | (per-changeset line, ⚠ blocked) | Lines | Reviewer | **Yes: changeset** | :65 |
| Review | Button | Review | Open the selected changeset | Reviewer | **Yes: changeset** | :24 |

Jargon: changeset. Dev-only: no.

### Window: Ghost Builder progress (GhostBuilderProgressWindow)

File: `UI/GhostBuilderProgressWindow.cs:18`. Kind: WPF Window (modeless).

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Status | TextBlock | Starting… | Progress line | Modeller | No | :35-37 |
| Cancel | Button | Cancel (then Cancelling…) | Stop the build | Modeller | No | :44-46 |

Jargon: No. Dev-only: no.

### Window: Publish progress (PublishProgress)

File: `UI/PublishProgress.cs:49` (code-built). Kind: WPF Window (modeless).

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Step line | TextBlock | Step n of 4 · … | Current step | BIM manager | No | PublishProgress.cs:68 |
| Detail | TextBlock | Revit: caption, n / m | Revit progress | BIM manager | No | :91, :121 |
| Note | TextBlock | (note) | Note | BIM manager | No | :123 |
| Cancel | Button | Cancel | Stop | BIM manager | No | :124 |

Jargon: No. Dev-only: no.

### Window: ROI Dashboard (RoiDashboard)

File: `UI/RoiDashboard.cs:14`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Heading | TextBlock | Return on investment | Title | BIM manager | No | RoiDashboard.cs:29 |
| Intro | TextBlock | (explains ledger counts) | Explains source | BIM manager | **Yes: ledger** | :30 |
| Line list | TextBlock list | (one line per counted item) | ROI figures | BIM manager | No | :47 |

Jargon: ledger. Dev-only: no.

### Window: Applied AI Changes (AppliedChangesWindow)

File: `UI/AppliedChangesWindow.cs:16`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Changeset list | ListBox/grid | (changesets) | Choose a changeset | Reviewer | **Yes: changeset** | (class) :16 |
| Instruction | TextBlock | Select a changeset and press Check revert… | Explains | Reviewer | **Yes: changeset** | :24 |
| Check revert | Button | Check revert | Preview what would revert | Reviewer | No | :26 |
| Revert | Button | Revert | Revert changeset | Reviewer | **Yes: changeset** (in "Revert" text: no) | :27 |
| Preview | TextBox (read-only) | Loading… | Shows what would change | Reviewer | No | :21 |
| Reason | TextBox | Why you revert it (recorded on the ledger with your name) | Reason, saved to ledger | Reviewer | **Yes: ledger** | :41 |

Jargon: changeset, ledger. Dev-only: no.

### Window: New issue (NewIssueDialog)

File: `UI/NewIssueDialog.cs:14`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Points-at line | TextBlock | (pointsAt) | Which element | Modeller | No | :52 |
| Create issue | Button | Create issue (default) | Create the BCF issue | Modeller | No (BCF in title) | :24 |
| Cancel | Button | Cancel | Close | Modeller | No | :41 |

Jargon: No visible. Dev-only: no.

### Window: Datum from Drawings review (DatumReviewWindow)

File: `UI/DatumReviewWindow.cs:17`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Header | TextBlock | Read from: source; notes | Source and notes | Modeller | No | :38-40 |
| Anchor | TextBlock + row | ±0.00 at: | Choose datum anchor | Modeller | No | :52 |
| Level rows | CheckBox, TextBox (name), TextBox (elevation), CheckBox (story) | levels | Tick and edit levels | Modeller | No | :58-79 |
| Grid rows | CheckBox, TextBox (name) | grids | Tick and name grids | Modeller | No | :79-80 |
| Create ▶ | Button | Create ▶ | Create | Modeller | No | :92 |
| Cancel | Button | Cancel | Close | Modeller | No | :93 |

Jargon: No. Dev-only: no.

### Window: Coordination Issues (BCF) (BcfIssuesWindow)

File: `UI/BcfIssuesWindow.cs:22`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Filters | ComboBox x3 + search | Status, Priority, Type, Search, Mine (CheckBox) | Filter issues | Coordinator | **No** (BCF in title) | :33, :76, :92 |
| Issue list | Button per issue | (issue title) | Select | Coordinator | No | :126 |
| Details | TextBlock (Consolas) | (issue detail) | Detail text | Coordinator | No | :116 |
| Edit: Status / Priority / Assigned / Due | ComboBox, TextBox, DatePicker | Status, Priority, Assigned, Due | Edit fields | Coordinator | No | :137-140 |
| Save changes | Button | Save changes | Save edit (ledger row) | Coordinator | **Yes: ledger** (in tooltip) | :134 |
| Send comment | Button | Send comment | Post comment | Coordinator | No | :142 |
| Comment box | TextBox | (tooltip: sends under your name) | Comment | Coordinator | No | :146 |
| Section box | Button | (tooltip: section box, 1 m air) | Create section box | Coordinator | No | :152 |
| Raise | Button | (tooltip: raise issue from selection) | Create issue from selection | Coordinator | No | :158 |
| Fix | Button | (tooltip: only IDS issues can be fixed) | Fix in place | Coordinator | **Yes: IDS** (in tooltip) | :161 |
| Import | Button | (tooltip: .bcf/.bcfzip from ACC, BIMcollab) | Import BCF | Coordinator | No (BCF in tooltip) | :166 |
| Export | Button | (tooltip: BCF 2.1 for ACC, or BCF 3.0) | Export BCF | Coordinator | No (BCF) | :169 |
| Status | TextBlock | … | Status | Coordinator | No | :174 |

Jargon: ledger, IDS (tooltips); BCF (labels). Dev-only: no.

### Window: Massing review (MassingReviewWindow)

File: `UI/MassingReviewWindow.cs:25`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Estimate notice | TextBlock | This is an ESTIMATE from the project images… | Warns it is an estimate | Architect, modeller | No | :49-51 |
| Known width / height | TextBox (metres) | Known width (m), Known height | One known dimension | Architect | No | :67, :139-142 |
| Floor list | TextBlock | (storey data) | Storey counts | Architect | No | :73 |
| Scale ▶ | Button | Scale ▶ | Compute scale | Architect | No | :95 |
| Status | TextBlock | (status) | Status | Architect | No | :107 |
| Vision notes | TextBlock | Vision notes: … | Model notes | Architect | No | :117-119 |
| File for review ▶ | Button | File for review ▶ | File changeset | Architect | **Yes: changeset (in status line)** | :123 |
| Cancel | Button | Cancel | Close | Architect | No | :125 |

Jargon: changeset (status). Dev-only: no.

### Window: Pick DWG (DwgPickWindow)

File: `UI/DwgPickWindow.cs:11`. Kind: WPF Window (modal).

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Header | TextBlock | (drawing info) | Explains | Modeller | No | :53 |
| Units | ComboBox | The drawing's units: | Set units (inch vs metre) | Modeller | No | :60, :64 |
| Use selected drawing ▶ | Button | Use selected drawing ▶ | Choose the DWG | Modeller | No (DWG in path) | :42 |
| Pick from model… | Button | Pick from model… | Pick from model | Modeller | No | :44 |
| Cancel | Button | Cancel | Close | Modeller | No | :46 |

Jargon: No visible. Dev-only: no.

### Window: Annotate views and pins (AnnotatePreviewWindow)

File: `UI/AnnotatePreviewWindow.cs:18`. Kind: WPF Window (modal).

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Header | TextBlock | (plan explanation) | Explains levels × plan entries | Modeller | No | :49 |
| Sheets combo | ComboBox | Sheets and tags for: | Choose sheet | Modeller | No | :97-102 |
| View/pin rows | CheckBox + TextBlock | view names | Tick views to create | Modeller | No | :135-137 |
| Plan tree | TreeView | (per-level plan text, refusal reasons) | Shows plan and refusals | Modeller | No | :159-160 |
| Create ▶ | Button | Create ▶ (default) | Create views and pins | Modeller | No | :113 |
| Cancel | Button | Cancel | Close | Modeller | No | :114 |

Jargon: No visible. Dev-only: no.

### Window: Changeset review (ChangesetReviewWindow)

File: `UI/ChangesetReviewWindow.cs:33`. Kind: WPF Window (the largest window).

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Changeset name / summary | TextBlock | (name, declined line, not-carried line) | Shows the changeset | Reviewer | **Yes: changeset** | :120-143 |
| Retry report | Button | Retry report | Retry | Reviewer | No | :72 |
| Batch notice | TextBlock | Over {limit} ticked: why they go as one… | Batch explanation | Reviewer | **Yes: changeset-style batch** | :161 |
| Reviewer note | TextBox | Reviewer note (recorded with the result; Decline all needs one) | Note on ledger | Reviewer | **Yes: ledger** | :165, :82 |
| Tick suggested | Button | Tick suggested | Tick suggestions | Reviewer | No | :169 |
| Untick all | Button | Untick all | Untick | Reviewer | No | :170 |
| Show the scan | CheckBox | Show the scan | Show scan | Reviewer | No | :180 |
| Flag a stair… | Button | Flag a stair… | Save stair flag | Reviewer | No | :187 |
| Propose terrain from the scan… | Button | Propose terrain from the scan… | Propose Toposolid | Reviewer | No | :193 |
| Row checkbox | CheckBox per row | (element) | Tick to apply | Reviewer | No | :219 |
| Show | Button | Show | Zoom to element | Reviewer | No | :242 |
| Group Tick / Untick | Button x2 | Tick group, Untick group | Group ticks | Reviewer | No | :301-302 |
| Reason for the unticked here | TextBox | Reason for the unticked here | Reason, recorded | Reviewer | **Yes: ledger** (tooltip) | :312-314 |
| Why you apply the rows ticked here | TextBlock | (required) | Required reason | Reviewer | **Yes: ledger** (tooltip) | :323 |
| Propose a stair… | Button | Propose a stair… | Plan a stair | Reviewer | No | :510 |
| Scan slice | CheckBox | Scan slice | Show scan slice | Reviewer | No | :494 |

Jargon: changeset, ledger (in reasons). Dev-only: no. Note: "Propose terrain" and "Toposolid" are technical terms.

### Window: Fix in place (FixInPlaceWindow)

File: `UI/FixInPlaceWindow.cs:16`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Head title / detail | TextBlock | (topic title, failing count) | Issue summary | Coordinator | No | :42-49 |
| Set all ticked to | Label + Buttons | Set all ticked to: (buttons from factory) | Bulk set value | Coordinator | No | :62, :94 |
| Element rows | CheckBox, TextBlock (label), TextBlock (current), TextBox (proposed), TextBlock (verdict) | element, current value, proposed value | Tick and edit values | Coordinator | No | :114-132 |
| Empty notice | TextBlock | None of this issue's N element(s) are in the open model. | Explains | Coordinator | No | :86 |

Jargon: No. Dev-only: no.

### Window: Naming Manager (NamingManagerWindow)

File: `UI/NamingManagerWindow.cs:17`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Filters | ComboBox x3 + search | Rule, Category, Verdict, Search | Filter rows | Modeller, BIM manager | No | :42-48 |
| Row checkbox | CheckBox | (ticked) | Tick to rename | Modeller | No | :117 |
| Row meta | TextBlock | category, family name | Context | Modeller | No | :119 |
| Current name | TextBlock | (current) | Name now | Modeller | No | :121 |
| Proposed name | TextBox | (suggestion, with token tooltip) | Edit proposal | Modeller | No | :131, :151 |
| Verdict | TextBlock | (verdict text) | Duplicate, blocked, etc. | Modeller | No | :132, :162 |
| Instances | TextBlock | (count) | Instances in model | Modeller | No | :165-166 |
| Fix button | Button | (tooltip: review and rename this one element) | Single-element fix | Modeller | No | :171 |
| Action buttons | Button (factory) | (rename, tick, etc.) | Apply batch | BIM manager | **Yes: ledger?** (not in visible text; each batch one ledger row per window text) | :75 |

Jargon: ledger (window text, per the ribbon tooltip). Dev-only: no.

### Window: Ghost Builder review (GhostReviewWindow)

File: `UI/GhostReviewWindow.cs:23`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | Window | Ghost Builder: review the build proposal | Heading | Modeller | No | :115 |
| Build on level | ComboBox | Build on level: | Choose level | Modeller | No | :138-140 |
| Header | TextBlock | Nothing has been built yet. Tick the layers… | Explains | Modeller | No | :146-148 |
| Layer rows | CheckBox, TextBlock (name), TextBlock (count), TextBlock (badge), ComboBox (type) | layer, count, badge, type | Tick layers and pick type | Modeller | No | :219-263 |
| Parameter lines | TextBlock | ⚙ name = value | Shows parameters | Modeller | No | :286-288 |
| Action buttons | Button (factory) | Build, Cancel, etc. | Build | Modeller | No | :172 |
| Status | TextBlock | … | Status | Modeller | No | :127 |

Jargon: No visible. Dev-only: no.

### Window: Protected from automated changes (ProtectionWindow)

File: `Commands.Protection.cs:43` (code-built). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | TextBlock | Protected from automated changes | Heading | BIM manager | No | Commands.Protection.cs:67 |
| Explainer | TextBlock | No changeset — from AI, the web or Promote… | Explains | BIM manager | **Yes: changeset** | :68-69 |
| Structural | CheckBox | Walls and floors marked "Structural" in Revit | Protect structural | BIM manager | No | :48 |
| Category boxes | CheckBox x n | category labels | Tick categories | BIM manager | No | :75 |
| Workset boxes | CheckBox x n | workset names | Tick worksets | BIM manager | No | :84 |
| Named worksets | TextBox | Also protect worksets named (…) | Pattern list | BIM manager | No | :85 |
| In force now | TextBlock | In force now: … | Current policy | BIM manager | **Yes: ruleset-style "policy"** (no) | :116, :138 |
| To office | CheckBox | Every project in the office | Scope to office | BIM manager | No | :90 |
| Save | Button | Save | Save policy (ledger) | BIM manager | **Yes: ledger** (in ribbon tooltip) | :55 |
| Reset | Button | Reset to the built-in default | Reset | BIM manager | No | :56 |

Jargon: changeset; ledger (on save). Dev-only: no.

### Window: PC Settings (PcSettingsWindow)

File: `Commands.PcSettings.cs:38`. Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| Title | TextBlock | This PC's settings | Heading | IT / admin | No | Commands.PcSettings.cs:65-67 |
| Bridge / token / sign-in / AI / cloud fields | TextBox + Browse… + Test | bridge address, token, sign-in address and key, local AI address and models | Per-PC config | IT / admin | **Yes: bridge, token** (keys) | :120, :133, :139 |
| Remove it | CheckBox | Remove it | Remove the stored token | IT / admin | **Yes: token** | :43 |
| Cloud opt-in | CheckBox | Allow a model off this PC (https only — drawings and photos then leave this PC) | Allow cloud | IT / admin | No | :46 |
| AI policy | TextBlock | Reading the AI policy… | Current AI policy | IT / admin | No | :160 |
| Test | Button | Test | Test a connection | IT / admin | No | :139 |
| Browse… | Button | Browse… | Choose folder | IT / admin | No | :133 |
| Save / Close | Button x2 | Save, Close | Save or close | IT / admin | No | :49, :96 |

Jargon: bridge, token. Dev-only: partial (admin/IT; not developer tooling). Count as: not dev-only.

### Window: Standards editors (GuidelineWindow, IfcExportWindow via StandardEditorWindow)

File: `Commands.StandardsEditors.cs:101` (base), `:261` (GuidelineWindow), `:439` (IfcExportWindow). Kind: WPF Window.

| Control | Kind | Visible text | What it does | Who needs it | Jargon? | Source |
|---|---|---|---|---|---|---|
| In-force line | TextBlock | In force now: … | Current standard | BIM manager | No (Kind) | :153, :168 |
| Every project in office | CheckBox | Every project in the office | Scope | BIM manager | No | :126 |
| Save | Button | Save (enabled after change) | Save; next version recorded in ledger | BIM manager | **Yes: ledger** (in intro) | :109, :134 |
| Field text boxes / combos | TextBox, ComboBox | (parameters, names) | Edit fields | BIM manager | No | :224, :232 |
| Guideline: rule rows | TextBlock "Rule n", fields | Rule 1…n, category, family, type | Rules in order | BIM manager | No | :363 |
| Guideline: sheets, placement | TextBlock, TextBox | {level} {use} {prefix} {n}; workset text | Sheet naming, placement | BIM manager | No | :417, :423 |
| Guideline: phase | CheckBox | Place new elements in the phase of the view the person builds in | Phase | BIM manager | No | :432 |
| IFC: class help | TextBlock | IFC class … Export Type to IFC As | Explains IFC class | BIM manager | **Yes: IFC** | :471-472 |
| IFC: per-instance / per-type | RadioButton x2 | For each element (instance); For its type | Scope of property set | BIM manager | No | :549-550 |
| IFC: class ticks | CheckBox per class | IFC class names | Choose classes | BIM manager | **Yes: IFC** | :561 |
| IFC: properties | ComboBox per property | (Revit parameter types) | Map to parameters | BIM manager | **Yes: IFC** | :580 |

Jargon: ledger, IFC. Dev-only: no. Note: these two editors are opened from the Standards pulldown.

### Window: Pane-less settings in Project Setup and others

Covered above. Remaining windows in the 27 are the 7 XAML windows plus the 20 code windows listed. Windows not in this table: `Commands.Workflow.cs` (RequestsWindow and related), the `Commands.Phase2.cs` and `Commands.cs:111` windows noted in scope.

---

## Notes for the simplification pass

- The ribbon has 44 buttons across 4 panels; the Standards & Build panel alone has 19 (8 items under Standards, 7 under Model from Drawings).
- Most jargon is in the Standards & Build and Publish panels, and in the Governed Publish, IFC Delivery Gate and Applied AI Changes tooltips.
- Shown to every user regardless of role: about 28 items (pane, Show Panel, Scan Now, Scorecard, Sign in, Change Requests, etc.).
- Setup-once items: Review Flag, Project Setup, PC Settings, Sign in (first use).
- Worktree copies under `.claude/worktrees/` duplicate these XAML files; they were excluded.
