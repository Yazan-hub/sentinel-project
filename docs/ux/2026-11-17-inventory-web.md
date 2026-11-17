# Sentinel web app: UI inventory (2026-11-17)

Read-only inventory of `WebApp/src`. No source file was changed.

## Scope and method (read this first)

- Built from: the layout and tab wiring in `WebApp/src/main.ts` (lines 189-540), every `<button>` label in non-test `.ts` files, `label`/`title`/`placeholder`/`aria-label` strings, and the visible text labels in the panel files listed below.
- **Coverage is partial.** `WebApp/src` has 283 files (about 20k lines in `setups/`). The following were NOT walked control by control: the platform built-ins (Explorer tree, Data table, Settings, top-viewer toolbar, workspace page), `reality-capture-viewer.ts` (1,383 lines), `clipper-tool.ts` and `measurement-tool.ts` (tool palettes only sampled), and the bulk of `files-panel.ts` evidence sub-forms (buttons listed, nested state variants merged). Each such area is marked "partial" in its heading.
- "Who needs it" and "Dev-only" are my inference from the label and file, not from user research. Treat them as a starting guess.
- Jargon is tagged where the word appears in the label, placeholder, title or visible status text. Words that only appear in code comments are not counted.
- Arabic: none found. A scan of all non-test `.ts` files and `index.html` found no Arabic characters. The UI is English only (`index.html` has `lang="en"`).

## Totals

Totals below are computed from the tables in this file (rows, jargon column, dev-only column) and are repeated in the final report.

| Measure | Count |
|---|---|
| Top-level sections in this file | 14 |
| Screens / panels (sections and sub-sections) | 33 |
| Rows in the tables (controls, fields, toggles, plus some status text and headings) | 294 |
| Rows with jargon shown (Jargon column = yes) | 149 |
| Rows marked dev-only | 9 |
| Arabic or mixed-language UI strings | 0 |

Not counted: the controls in the "Not walked" list at the end (platform built-ins, reality-capture viewer, part of files-panel evidence forms, part of standard-forms). The real control count is higher than 294.

## Internal jargon that reaches the user (label-level count in this inventory)

Label-level counts over the Label, Kind, What it does and Jargon columns of the 294 rows. A row can hold more than one word, so counts overlap. Words with 2 or more rows:

| Word | Rows |
|---|---|
| AI (incl. "Which AI", "Ask AI", cloud AI) | 20 |
| ISO (incl. ISO 19650, ISO name) | 14 |
| pack / standard / standards pack | 11 / 10 |
| key (API or feed key, encryption key) | 9 |
| scan (scan model, scan candidates) | 9 |
| BCF | 8 |
| container | 7 |
| BEP | 6 |
| RFI | 6 |
| ledger | 6 |
| gate (incl. GATE PASS) | 6 + 2 |
| revision | 6 |
| evidence (evidence pack) | 6 |
| CSV | 5 |
| EIR | 5 |
| splat | 5 |
| Revit | 5 |
| READINESS | 5 |
| IDS | 4 |
| IFC (incl. IFC2X3, IFC4) | 4 + 2 |
| CDE | 4 |
| baseline | 4 |
| archive | 4 |
| Copilot | 4 |
| BoQ | 3 |
| WIP | 3 |

Words with 1 row: MIDP, TIDP, JSON, RFC 3161, verifier, API, sentinel-ifc, sentinel-drawing, sentinel-survey, LOD, LOD state, S0, DirectShape, Generic Model, Power BI, Wikimedia, Bridge (2), KPI (2), hash, fork, passphrase, encrypted, Measured, Declared, take-off, live plan, retire, 2.1, 3.0, "IDS OK", "Std compliance", "ISO 19650".

The highest-jargon screens are Project Files (3b), Deliverables (3d), Standards and Project Settings (3e, 9), Coordination (7a to 7d) and Lifecycle (8a to 8d). Simplification candidates: the sentinel-* tool names (in the Read IFC, Read drawings and Run survey buttons), "RFC 3161" and "verifier" (dev-only), and the Revit DirectShape/Generic Model labels.

---

## 1. Shell (always visible)

Partial: the platform activity bar and viewer toolbar are not walked.

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Sentinel - BIM Governance (browser title) | text | Window title | all | no | index.html:6 |
| Account avatar / "Sign in" | button | Opens the account menu, or signs in | all | no | auth-widget.ts:162 |
| Switch project | button | Opens the project switcher pill | all | no | project-switcher.ts:40 |
| Manage projects... | menu | Opens the Projects hub | all | no | main.ts:517 |
| Projects (activity bar) | tab | Projects hub landing | all | no | main.ts:462 |
| BIM Tools (activity bar) | tab | Groups 7 tools (see section 6) | modeller | no | main.ts:472 |
| Coordination (activity bar) | tab | Groups Issues, RFIs, Clash, CDE | BIM manager, reviewer | no | main.ts:476 |
| Lifecycle (activity bar) | tab | Groups 5D, 6D, 4D, 7D, Tender, Owner, Data feed | BIM manager | no | main.ts:480 |
| Explorer (activity bar) | tab | Platform model tree and properties (not walked) | modeller | no | main.ts:485 |
| Data (activity bar) | tab | Platform data table (not walked) | dev-only | no | main.ts:489 |
| Standards (activity bar) | tab | Standards marketplace (section 11) | BIM manager | yes: standard, pack | main.ts:493 |
| QA (activity bar) | tab | QA scan panel (section 12) | modeller | no | main.ts:497 |
| Settings (activity bar) | tab | Platform settings (not walked) | BIM manager | no | main.ts:501 |
| Guide (activity bar) | tab | In-app guide (section 5) | all | no | main.ts:463 |
| Copilot (activity bar) | tab | Grounded assistant (section 4) | all | yes: LLM-style term "Copilot" is user-facing; "Model", "Which AI" in panel | main.ts:467 |
| Workspace (activity bar, hidden unless open) | tab | Reopens last BIM document | BIM manager | yes: BIM document | main.ts:506 |
| Next strip: Open | button | Jumps to the tab named by the next journey step | BIM manager | no | next-strip.ts:82 |
| Next strip: Refresh | button | Re-reads standards and next step | all | no | next-strip.ts:85 |
| Next strip: Guide link | button | Opens the Guide layout | all | no | main.ts:343 |
| <- All projects | button | Returns to the Projects hub | all | no | main.ts:348 |

## 2. Projects hub

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| + New project | button | Opens the new-project form | BIM manager | no | projects-hub-panel.ts:73 |
| Deleted models | button | Lists model files in Deleted items across projects | BIM manager | yes: Deleted items (word is plain) | projects-hub-panel.ts:74 |
| Reload | button | Re-reads the project list | all | no | projects-hub-panel.ts:75 |
| Clear | button | Clears the search and filters | all | no | projects-hub-panel.ts:84 |
| Clear the filters | button | Same as Clear, shown on empty result | all | no | projects-hub-panel.ts:117 |
| Search projects (name, key, office) | text input | Filters project cards | all | no | projects-hub-panel.ts:79 |
| Type / Office / Status / Sort | dropdown | Filters and sorts cards | all | yes: "Office" is a firm unit, no jargon | projects-hub-panel.ts:80-83 |
| Open project | button | Enters the project space | all | no | projects-hub-panel.ts:266 |
| Restore | button | Restores a deleted project | BIM manager | no | projects-hub-panel.ts:267 |
| Project name (e.g. Riverside Tower) | text input | Name of new project | BIM manager | no | projects-hub-panel.ts:437 |
| Appointing party (optional) | text input | Client name | BIM manager | no | projects-hub-panel.ts:438 |
| Create & open | button | Creates project and enters it | BIM manager | no | projects-hub-panel.ts:447 |
| Cancel | button | Closes the new-project form | all | no | projects-hub-panel.ts:448 |

## 3. Project space (tabs: Dashboard, Project Files, Documents, Deliverables, Settings)

Tab names: main.ts:327-331. Header and back button: main.ts:345-349.

### 3a. Dashboard (Command Center)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Run gate | button | Runs the stage gate check on the bridge | BIM manager | yes: gate | project-shell.ts:19 |
| Recompute KPIs | button | Recalculates dashboard numbers | dev-only | yes: KPIs | project-shell.ts:70 |
| Run gate -> advance to <next stage> | button | Runs the gate and moves the project to the next stage | BIM manager | yes: gate | project-shell.ts:323 |
| Tender / Design / Coordination / Construction / Handover / Operate | stage labels | Lifecycle stage names (shown as steps) | all | no | project-shell.ts:45-46 |
| Model health / Std compliance / Open issues / Cost 5D / LOD state | KPI tiles | Read-only numbers | all | yes: "Std compliance", "LOD state", "5D" | project-shell.ts:268-310 |
| GATE PASS / GATE HOLD | status badge | Result of the gate | all | yes: GATE | project-shell.ts:319 |
| My work | section | Lists the user's review lines; a line opens the Review desk | reviewer | no | project-shell.ts:176 |

### 3b. Project Files (versions, evidence, deleted items)

Partial: the evidence sub-forms are listed by their main button; state variants are merged.

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| + Upload version | button | Picks an IFC or file and uploads a new version | modeller | yes: IFC, version | files-panel.ts:170 |
| Reload (icon) | button | Re-reads the file list | all | no | files-panel.ts:171 |
| Archived (n) | toggle | Shows archived files | BIM manager | yes: archived | files-panel.ts:302 |
| On hold (n) | toggle | Shows files held by the publish check | BIM manager | yes: hold (state) | files-panel.ts:651 |
| Pick the corrected file | button | Uploads a corrected file for a held item | modeller | yes: corrected file, judged | files-panel.ts:661 |
| Dismiss... / Dismiss with this reason / Cancel | button, text input | Dismisses a held item; the reason is written to the ledger | BIM manager | yes: ledger | files-panel.ts:665-667 |
| Type gaps (n) | toggle | Shows missing type gaps | modeller | yes: type gaps | files-panel.ts:698 |
| Evidence (n) | toggle | Shows the evidence pack for a file | BIM manager | yes: evidence pack | files-panel.ts:768 |
| Make the evidence pack | button | Creates the evidence pack | BIM manager | yes: evidence pack | files-panel.ts:771 |
| Sign (c) | button | Signs a check (c = check name) | reviewer | yes: check codes | files-panel.ts:780 |
| Mark faces and plates | button | Starts marking for blur | modeller | no | files-panel.ts:787 |
| Move / Turn / Scale | button | Transform mode for a 3D splat | modeller | no | files-panel.ts:790 |
| Save placement / Hide | button | Saves or hides a splat placement | modeller | yes: splat | files-panel.ts:791 |
| Show in 3D / Loading... | button | Loads a photo's splat into the 3D view | modeller | yes: splat | files-panel.ts:792 |
| Save blurred copy | button | Saves a blurred copy of a photo | modeller | no | files-panel.ts:801 |
| Find faces / Undo last box | button | Auto-finds faces; undoes last box | modeller | no | files-panel.ts:801 |
| No faces or number plates in this photo | button | Attests the photo is clean | modeller | no | files-panel.ts:802 |
| Take out panoramas | button | Removes panorama images | modeller | yes: panorama | files-panel.ts:805 |
| Set delete-by / Retire now | button, date input | Sets a retention date or retires a file now | BIM manager | yes: retire | files-panel.ts:807-808 |
| remove | button | Removes a proposed material | modeller | no | files-panel.ts:821 |
| Choose / Propose | button | Chooses a material or wall; proposes a level or alignment | modeller | yes: level, alignment (proposal) | files-panel.ts:825, 833, 852 |
| Letter / Hide letter | button | Shows the request letter | BIM manager | no | files-panel.ts:854 |
| Copy | button | Copies a letter or link | all | no | files-panel.ts:856 |
| + Ask the owner... | button | Drafts a request to owner, architect or municipality | BIM manager | no | files-panel.ts:857 |
| Draft the letter | button | Drafts the request letter | BIM manager | no | files-panel.ts:863 |
| Admit (photo, model, splat, drawing) | button | Admits a file into the evidence pack | BIM manager | yes: evidence, admit (verb) | files-panel.ts:868-889 |
| Admit model / Admit splat / Admit drawing / Admit photo | button | Admit by kind | BIM manager | yes: splat | files-panel.ts:873-885 |
| a third party's... | button | Marks a bought-in model with its provider | BIM manager | no | files-panel.ts:890 |
| as drawing... | button | Marks a scan as a drawing answering a request | modeller | yes: drawing | files-panel.ts:891 |
| Candidates / Hide candidates | button | Shows scan candidates | modeller | yes: candidates | files-panel.ts:901 |
| Propose... / Cancel proposal | button | Proposes a candidate | modeller | no | files-panel.ts:902 |
| Run survey | button | Runs the survey reader on scans | modeller | yes: survey, sentinel-survey | files-panel.ts:909 |
| Read drawings | button | Reads page 1 of each PDF plan | modeller | yes: sentinel-drawing | files-panel.ts:910 |
| Read IFC / Read IFC <id> | button | Reads levels, walls, openings from an IFC | modeller | yes: IFC, sentinel-ifc | files-panel.ts:911-912 |
| NOTICE | button | Shows credits text for evidence tools | BIM manager | yes: NOTICE.txt | files-panel.ts:921 |
| Re-check | button | Re-hashes every admitted file | BIM manager | yes: hash | files-panel.ts:922 |
| Deleted items (n) | toggle | Shows deleted files | BIM manager | no | files-panel.ts:931 |
| Restore | button | Restores a deleted file | BIM manager | no | files-panel.ts:940 |
| Restore with this reason / Save / Cancel | button, text input | Restore or rename with a reason | BIM manager | yes: ledger | files-panel.ts:973-982 |
| Unarchive | button | Moves archived versions back to published | BIM manager | yes: archive | files-panel.ts:993 |
| Archive / Confirm archive | button | Archives published versions | BIM manager | yes: archive, immutable archive | files-panel.ts:995 |
| Rename | button | Renames a file | modeller | no | files-panel.ts:1007 |
| Delete / Confirm delete | button | Moves a file to Deleted items | BIM manager | no | files-panel.ts:1009 |
| show n older version(s) | toggle | Shows older versions | modeller | no | files-panel.ts:1019 |
| Set live | button | Marks a version as the live one | BIM manager | no | files-panel.ts:1041 |
| Compare | button | Compares two versions | modeller | yes: version | files-panel.ts:1042 |
| Open 3D | button | Loads version geometry into the viewer | modeller | no | files-panel.ts:1043 |
| History | button | Opens the version audit trail | BIM manager | yes: audit | files-panel.ts:1057 |

### 3c. Documents (BEP, EIR, READINESS)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Project Documents | section title | Document list | all | no | docs-panel.ts:143 |
| BEP / EIR | badge | Document type | BIM manager | yes: BEP, EIR | docs-panel.ts:102, 209 |
| READINESS | section | Readiness check, pillars and checks | BIM manager | yes: READINESS, Measured/Declared | docs-panel.ts:180, 284 |
| Open / Open workspace | button | Opens the document in the workspace | all | no | docs-panel.ts:182 |
| Send it for review from the workspace | hint | Points to review flow | all | no | docs-panel.ts:63 |
| + New document | button | Creates a document (form) | BIM manager | yes: BEP, EIR | docs-panel.ts:201-209 (form) |
| Document title | text input | Document name | BIM manager | no | docs-panel.ts:201 |
| Standards / People / Process | pillar tabs | Readiness pillars | BIM manager | yes: "Pillar" | docs-panel.ts:292 |
| Measured / Declared / Missing | status | Readiness state | BIM manager | yes: Measured, Declared | docs-panel.ts:308-310 |
| Versions | section | Version list | all | no | docs-panel.ts:329 |
| Plan | section | Document plan | BIM manager | no | docs-panel.ts:341 |
| Publish... | button | Publishes a version | BIM manager | yes: publish (ISO state) | docs-panel.ts:351 |
| Version label for this publish | text input | Label, empty = version number | BIM manager | no | docs-panel.ts:355 |
| Publish | button | Confirms publish | BIM manager | no | docs-panel.ts:355 |
| Save answer | button | Saves an answer | BIM manager | no | docs-panel.ts:517 |
| Save plan | button | Saves the plan | BIM manager | no | docs-panel.ts:546 |
| Add a comment... / Post | text input, button | Adds a comment | all | no | docs-panel.ts:594-596 |
| Item / Pillar / Owner / Due / Status / Closes when | table headers | Readiness table | BIM manager | yes: Pillar, Closes when | docs-panel.ts:393 |
| Overall | label | Overall readiness | BIM manager | no | docs-panel.ts:459 |

### 3d. Deliverables (MIDP / TIDP)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Paste schedule | button | Pastes a delivery schedule | BIM manager | yes: schedule | deliverables-panel.ts:57, 129 |
| Deliverables | section | Deliverables list | BIM manager | no | deliverables-panel.ts:100 |
| By task team / Teams | tab | Groups by team | BIM manager | yes: task team | deliverables-panel.ts:105, 108 |
| Weekly report | tab | Weekly report view | BIM manager | no | deliverables-panel.ts:111 |
| Risks / Mobilisation / Capability | tab | Risk and capability views | BIM manager | no | deliverables-panel.ts:116 |
| Rebaseline | button | Resets the plan baseline | BIM manager | yes: baseline | deliverables-panel.ts:122 |
| Open in BEP | button | Opens the BEP document | BIM manager | yes: BEP | deliverables-panel.ts:134 |
| Download CSV | button | Exports the list | BIM manager | yes: CSV | deliverables-panel.ts:190 |
| Edit | button | Edits a deliverable | BIM manager | no | deliverables-panel.ts:302 |
| New deliverable / Edit deliverable | form | Form title | BIM manager | yes: container name (form field) | deliverables-panel.ts:322 |
| Expected container name (required) | text input | Container ISO name | BIM manager | yes: container, ISO | deliverables-panel.ts:332 |
| Responsible team | text input | Owner team | BIM manager | yes: task team | deliverables-panel.ts:334 |
| Title / Due date / Stage | text input | Deliverable fields | BIM manager | no | deliverables-panel.ts:354-357 |
| Expected revision / suitability | text input | Revision and suitability at milestone | BIM manager | yes: revision, suitability (S-code) | deliverables-panel.ts:358-359 |
| Purpose | text input | Which decision it supports | BIM manager | no | deliverables-panel.ts:362 |
| Save / Add / Cancel | button | Form actions | BIM manager | no | deliverables-panel.ts:324-325 |
| Preview / Cancel | button | Previews a pasted schedule | BIM manager | no | deliverables-panel.ts:390-391 |
| MIDP - by task team | section | Plan view | BIM manager | yes: MIDP | deliverables-panel.ts:478 |
| Owed by no one | section | Deliverables with no owner | BIM manager | no | deliverables-panel.ts:575 |
| Task teams - responsibility matrix | section | RACI-style matrix | BIM manager | yes: task team | deliverables-panel.ts:600 |
| delivered / late / in WIP / overdue / pending / no date | status | Deliverable status | all | yes: WIP | deliverables-panel.ts:30-35 |

### 3e. Project Settings (and standards forms)

Partial: standards forms are listed by section; field-level sub-forms are summarised.

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Save changes | button | Saves project settings | BIM manager | no | project-settings-panel.ts:56 |
| Delete project | button | Deletes the project | BIM manager | no | project-settings-panel.ts:92 |
| Link to this platform project / Unlink | button | Links the project to the platform | BIM manager | yes: platform | project-settings-panel.ts:140 |
| Project name, office, number, use, value | text inputs | Project identity fields | BIM manager | no | project-settings-panel.ts:61-73 |
| Edit... | button | Opens the standard's form | BIM manager | no | project-settings-panel.ts:404 |
| Generate from standards... | button | Builds the IDS from contract and naming | BIM manager | yes: IDS | project-settings-panel.ts:407 |
| Kind of standard | dropdown | Standard type | BIM manager | yes: standard | project-settings-panel.ts:429 |
| Choose file... | button | Picks an IFC or file | BIM manager | yes: IFC | project-settings-panel.ts:431 |
| Download audit pack | button | Downloads the audit pack | BIM manager | yes: audit pack, hash | project-settings-panel.ts:440 |
| Timestamp now | button | Stamps the ledger now with an RFC 3161 timestamp | dev-only | yes: ledger, RFC 3161 | project-settings-panel.ts:460 |
| Download the verifier | button | Downloads the offline ledger checker | dev-only | yes: verifier, ledger | project-settings-panel.ts:461 |
| Auto-publish (checkbox: Publish automatically when a saved model passes the gate) | toggle | Publishes on gate pass | BIM manager | yes: gate, publish | standard-forms.ts:89 |
| AI privacy: AI stays on this network / Mask names in what cloud AI reads | toggles | Limits AI processing | BIM manager | yes: AI, cloud AI | standard-forms.ts:96-100 |
| Review chain: Steps / Add a step / Who may approve / Who decides / Approvals needed | form | Sets review steps and approvers | BIM manager | yes: BEP, EIR, step names | standard-forms.ts:114-131 |
| EIR: issued by / accepted by; BEP step 1-3 | dropdowns | Names who signs each step | BIM manager | yes: BEP, EIR | standard-forms.ts:125-131 |
| ROI rate card: currency, hourly rate, source | form | Labour rate for ROI | BIM manager | no | standard-forms.ts:184-190 |
| Container naming: separator, parts, allowed values, ignore extensions | form | ISO container name rules | BIM manager | yes: ISO, container | standard-forms.ts:216-232 |
| Delivery contract: contract name, IFC schema, classes | form | Contract for IFC delivery | BIM manager | yes: IFC, IFC2X3, IFC4, IFCWALL | standard-forms.ts:268-275 |
| Templates: Full / Minimal, Create BEP (office template) | form | Document templates | BIM manager | yes: BEP, EIR, TIDP | template-form.ts:20-36 |
| Move up / Move down / Remove / Add block / Add section | button | Edits template sections | BIM manager | no | template-form.ts:141-162 |
| Edit... / Remove / Save the template / Cancel | button | Template actions | BIM manager | no | template-form.ts:208-223 |
| Install as the project's IDS / Download .ids / Cancel | button | Installs or downloads the IDS | BIM manager | yes: IDS, .ids | ids-from-standards.ts:58-59 |
| Yes / Save / Cancel / Edit / Remove | button | Annex capability rows | BIM manager | no | annex-panel.ts:72-101 |
| Evidence / Evidence note / Owner / Due (YYYY-MM-DD) / Publish in documents | form | Office register entry | BIM manager | yes: ISO date format | office-register-form.ts:35-44 |

## 4. Guide and Copilot

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Refresh (icon) | button | Reloads guide content | all | no | guide-panel.ts:201 |
| Guide topics (Project - Command Center, Copilot, Tender, 4D, 6D, 7D, Issues (BCF), RFIs, Owner, Standards, QA, Explorer) | links | Opens topic pages | all | yes: BCF, 4D, 6D, 7D | guide-panel.ts:35-129 |
| Ask | button | Sends a question | all | no | copilot-panel.ts:68, 82 |
| Agent | toggle | Switches Copilot to agent mode | modeller | yes: agent mode | copilot-panel.ts:69 |
| Reload project context (icon) | button | Re-reads project data for Copilot | all | no | copilot-panel.ts:74 |
| Which AI / Model | dropdown | Picks the AI model | dev-only | yes: AI, model | copilot-panel.ts:72-73 |
| Ask about this project... | text input | Question box | all | no | copilot-panel.ts:81 |

## 5. Ask Sentinel

Partial: sub-controls not walked.

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Ask Sentinel | panel title | Question panel | all | no | ask-sentinel.ts:1 |
| Cancel | button | Cancels a question | all | no | ask.ts:38 |

## 6. BIM Tools (activity bar group, 7 tabs)

### 6a. Browser

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| 2D | button | Scans for 2D drawings, sheets, annotations | modeller | yes: 2D | project-browser-panel.ts:28 |
| Plans | button | Opens a level as a live plan | modeller | yes: live plan (engine's Views) | project-browser-panel.ts:29 |
| Reload (icon) | button | Rebuilds from loaded models | modeller | no | project-browser-panel.ts:30 |
| Filter... | text input | Filters the tree | modeller | no | project-browser-panel.ts:33 |

### 6b. Properties

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Isolate | button | Isolates the selected element | modeller | no | properties-panel.ts:30 |
| Show all | button | Shows everything | modeller | no | properties-panel.ts:31 |
| click to copy | hint | Copies a value | modeller | no | properties-panel.ts:60, 82 |

### 6c. Visibility (Revit-style VG)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| IDS OK | toggle | Shows IDS-passing elements | BIM manager | yes: IDS | visibility-panel.ts:38 |
| Show all | button | Clears hide/isolate | modeller | no | visibility-panel.ts:40 |
| Reload (icon) | button | Re-reads | modeller | no | visibility-panel.ts:41 |
| Raise n BCF issue(s) + record in CDE | button | Raises BCF issues and records them in CDE | BIM manager | yes: BCF, CDE | visibility-panel.ts:225 |

Per-category hide / isolate / ghost / colour controls: partial, not walked.

### 6d. Views

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Reload (icon) | button | Re-reads published views | modeller | no | views-panel.ts:46 |
| Isolate level | button | Isolates a level | modeller | no | views-panel.ts:178 |
| Live plan | button | Opens the live plan | modeller | yes: live plan | views-panel.ts:179 |
| Prev / Next / Fit / Close | button | View navigation | modeller | no | views-panel.ts:180-183 |

### 6e. Sheets

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Reload sheets from the Bridge (icon) | button | Re-reads sheets | modeller | yes: Bridge | sheets-panel.ts:35 |
| Prev / Next / Fit / Close | button | Sheet navigation | modeller | no | sheets-panel.ts:159-162 |

### 6f. Review (review desk)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Approve | button | Approves a Revit-side change | reviewer | no | review-desk.ts:890 |
| Withdraw | button | Withdraws a submitted change | modeller | no | review-desk.ts:895 |
| Publish | button | Publishes a recipe | BIM manager | yes: recipe | review-desk.ts:855 |
| Recipes / Draft a recipe... / Recipe name | section and inputs | Recipe list and drafting | BIM manager | yes: recipe | review-desk.ts:862-881 |
| Measure against the scan / Measure again | button | Measures against a scan | modeller | yes: scan | review-desk.ts:807-828 |
| Edit cost per run | button | Edits the run cost | BIM manager | yes: cost per run | review-desk.ts:846 |
| Run on the evidence pack | button | Runs a recipe on evidence | BIM manager | yes: evidence pack | review-desk.ts:900 |
| Accept ticked / Decline ticked | button | Accepts or declines ticked Revit items | reviewer | yes: Revit | review-desk.ts:949 |
| Highlight in 3D / Clear / Show creates in 3D / Hide creates | button | 3D highlight of creates | reviewer | yes: creates | review-desk.ts:959 |
| Recently decided in Revit | section | Decided items | reviewer | yes: Revit | review-desk.ts:7, 784 |
| Generic Model / DirectShape / DirectShape or Generic Model | labels | Revit element categories | modeller | yes: DirectShape, Generic Model | review-desk.ts:175 |

### 6g. Performance

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Measure 10 s | button | Measures viewer FPS for 10 s | dev-only | no | perf-panel.ts:24 |

## 7. Coordination (Issues, RFIs, Clash, CDE)

### 7a. Issues (BCF)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| + New | button | New issue form | modeller | no | issue-panel.ts:124 |
| Refresh (icon) | button | Reloads issues | all | no | issue-panel.ts:125 |
| Import BCF... | button | Imports a .bcf or .bcfzip | BIM manager | yes: BCF, bcfzip | issue-panel.ts:135 |
| Export BCF | button | Exports a .bcfzip | BIM manager | yes: BCF, bcfzip | issue-panel.ts:139 |
| BCF version (select) | dropdown | BCF 2.1 or 3.0 | BIM manager | yes: BCF, 2.1, 3.0 | issue-panel.ts:138 |
| Title / Assigned to / Labels / Description | text inputs | Issue fields | modeller | no | issue-panel.ts:145-154 |
| Cancel / Send to Revit | button | Closes the form or sends to Revit | modeller | yes: Revit | issue-panel.ts:156-157 |
| Close all as superseded | button | Closes a set of issues | BIM manager | no | issue-panel.ts:218 |
| <- Back to list | button | Returns to the list | all | no | issue-panel.ts:229 |
| Assignee / Quick comment (Send) | text input | Assignee and comment | all | no | issue-panel.ts:248-251 |
| Save changes | button | Saves the issue | all | no | issue-panel.ts:250 |
| Send | button | Posts the quick comment | all | no | issue-panel.ts:252 |

### 7b. RFIs

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| + Raise | button | Raises a request | modeller | yes: RFI | rfi-panel.ts:59 |
| Refresh (icon) | button | Reloads | all | no | rfi-panel.ts:60 |
| Subject / Assign to / Question | text inputs | RFI fields | modeller | yes: RFI | rfi-panel.ts:67-72 |
| Cancel / Raise RFI | button | Closes or raises | modeller | yes: RFI | rfi-panel.ts:74-75 |
| <- Back | button | Returns | all | no | rfi-panel.ts:108 |
| Answer... / Save answer | text input, button | Answer | reviewer | no | rfi-panel.ts:116-118 |
| Approve & close | button | Closes the RFI | reviewer | no | rfi-panel.ts:119 |

### 7c. Clash

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| New | button | New clash item | modeller | no | clash-panel.ts:88 |
| Register | button | Registers clashes in the ledger | BIM manager | yes: ledger, register | clash-panel.ts:89 |
| Groups | button | Groups clashes by owner | BIM manager | yes: groups | clash-panel.ts:90 |
| Run clash | button | Runs the clash check | modeller | no | clash-panel.ts:92 |
| Run gate | button | Runs the gate on clashes | BIM manager | yes: gate | clash-panel.ts:96 |
| Hard / Clearance (type) | toggle | Hard or clearance test | modeller | yes: hard clash, clearance | clash-panel.ts:99 |
| Colour | button | Colours clashing elements red | modeller | no | clash-panel.ts:102 |
| Raise | button | Raises clashes as BCF and records in CDE | BIM manager | yes: BCF, CDE | clash-panel.ts:103 |
| Reset | button | Forgets resolved and raised clashes | BIM manager | no | clash-panel.ts:104 |
| show | button | Shows one clash in 3D | modeller | no | clash-panel.ts:247, 484 |
| Imported BCF | button | Adds open Clash issues from BCF to groups | BIM manager | yes: BCF | clash-panel.ts:461 |
| Mark not a clash | button | Records not-a-clash with reason | BIM manager | yes: ledger | clash-panel.ts:474 |
| Raise group | button | One Issue for the group, assigned to owner | BIM manager | yes: BCF (Issue) | clash-panel.ts:475 |
| Propose deleting the copies... | button | Proposes deleting duplicate copies | BIM manager | no | clash-panel.ts:477 |

### 7d. CDE (ISO 19650 containers)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Share / Publish / Reject / Archive | button | Moves a container state (WIP, Shared, Published, Archived) | BIM manager | yes: CDE, WIP, ISO 19650 states | cde-panel.ts:35-37 |
| Unlock (icon) | button | Unlocks encrypted files with the project passphrase | BIM manager | yes: passphrase, encrypted | cde-panel.ts:59 |
| Rotate key... / Rotate | button | Rotates the encryption key | dev-only | yes: key | cde-panel.ts:61, 645 |
| + Container | button | New container | BIM manager | yes: container | cde-panel.ts:62 |
| Refresh (icon) | button | Reloads | all | no | cde-panel.ts:63 |
| + Folder / Rename / Delete | button | Folder actions | BIM manager | no | cde-panel.ts:155-157 |
| My reviews (n) | toggle | Shows cards the user can approve | reviewer | yes: review | cde-panel.ts:334 |
| Create (WIP) | button | Creates a WIP container | BIM manager | yes: WIP | cde-panel.ts:541 |
| ISO name / Title / Discipline / Suitability (S0) | text inputs | Container fields | BIM manager | yes: ISO name, S0 | cde-panel.ts:535-539 |
| shared secret | text input | Shared secret for key | dev-only | yes: secret | cde-panel.ts:582 |
| old passphrase / new passphrase | text inputs | Rotates the passphrase | dev-only | yes: passphrase | cde-panel.ts:643-644 |
| Unlock | button | Unlocks | BIM manager | yes: encrypted | cde-panel.ts:583 |

## 8. Lifecycle (Cost 5D, Carbon 6D, 4D, COBie 7D, Tender, Owner, Data feed)

### 8a. Cost 5D

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Take off | button | Quantity take-off from the model | BIM manager | yes: take-off (BoQ) | cost-panel.ts:75 |
| Baseline | button | Snapshots cost as a baseline revision | BIM manager | yes: baseline, revision | cost-panel.ts:76 |
| Delta (compare) | button | Compares two revisions | BIM manager | yes: revision | cost-panel.ts:79 |
| CSV | button | Exports CSV | BIM manager | yes: CSV | cost-panel.ts:80 |
| show | button | Isolates the element | modeller | no | cost-panel.ts:302 |
| Baseline / Now (selects) | dropdown | Picks old and new revision | BIM manager | yes: revision | cost-panel.ts:77-78 |

### 8b. Carbon 6D

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Take off | button | Carbon take-off | BIM manager | yes: take-off | carbon-panel.ts:69 |
| Baseline / Now / Delta / CSV | button, dropdown | Same pattern as Cost | BIM manager | yes: baseline, revision, CSV | carbon-panel.ts:70-74 |
| Install factors | button | Installs carbon factors for the project | BIM manager | yes: carbon factors | carbon-panel.ts:75 |
| show | button | Isolates element | modeller | no | carbon-panel.ts:341 |

### 8c. 4D Sequence

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Trade / Level | dropdown | Filters the sequence | BIM manager | no | timeline-panel.ts:55-56 |
| Generate | button | Generates a construction sequence | BIM manager | yes: sequence | timeline-panel.ts:58 |
| Import CSV / Import | button | Imports a schedule | BIM manager | yes: CSV | timeline-panel.ts:59, 71 |
| Play (triangle) | button | Plays the simulation | BIM manager | no | timeline-panel.ts:63 |

### 8d. COBie 7D

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Assets | button | Opens the asset register | BIM manager | yes: COBie (asset) | cobie-panel.ts:39 |
| Export COBie | button | Exports COBie | BIM manager | yes: COBie | cobie-panel.ts:40 |
| Isolate | button | Isolates an asset | modeller | no | cobie-panel.ts:108 |

### 8e. Tender

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| + New | button | New tender | BIM manager | no | tender-panel.ts:46 |
| Refresh (icon) | button | Reloads | all | no | tender-panel.ts:47 |
| New tender / Return by | form | Tender name and return date | BIM manager | no | tender-panel.ts:97-99 |
| Cancel / Create from model BoQ | button | Creates tender from BoQ | BIM manager | yes: BoQ | tender-panel.ts:102-103 |
| Item / Total | table | BoQ lines | BIM manager | yes: BoQ | tender-panel.ts:153, 162 |
| Award | button | Awards tender to bidder | BIM manager | no | tender-panel.ts:171 |
| + Enter a bid | button | Enters a bid | BIM manager | no | tender-panel.ts:177 |
| Bidder name | text input | Bidder | BIM manager | no | tender-panel.ts:180 |
| Submit bid | button | Submits bid | BIM manager | no | tender-panel.ts:186 |
| <- Back | button | Returns | all | no | tender-panel.ts:146 |

### 8f. Owner (FM portal)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Load from model | button | Loads assets from the model | BIM manager | no | owner-panel.ts:50 |
| Search assets... | text input | Filters assets | owner | no | owner-panel.ts:52 |
| Locate in model | button | Selects the asset in 3D | owner | no | owner-panel.ts:145 |

### 8g. Data feed (no-toll feed)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Make a feed key | button | Creates an API key | BIM manager | yes: API key, feed key | data-feed-panel.ts:47 |
| Copy | button | Copies the feed URL or key | BIM manager | yes: URL, key | data-feed-panel.ts:75, 109 |
| Revoke | button | Revokes a key | BIM manager | yes: key | data-feed-panel.ts:90 |
| Elements, newest revision (CSV) / Revisions (CSV) / Elements, newest revision (JSON) | links | Feed downloads | BIM manager | yes: CSV, JSON, revision | data-feed-panel.ts:19-21 |
| What it is for, e.g. Power BI on my laptop | text input | Key label | BIM manager | yes: Power BI | data-feed-panel.ts:46 |

## 9. Standards (marketplace)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Publish | button | Publishes a standards pack | BIM manager | yes: standards pack | packs-panel.ts:47 |
| Refresh (icon) | button | Reloads packs | all | no | packs-panel.ts:48 |
| Install | button | Installs a pack | BIM manager | yes: pack | packs-panel.ts:119 |
| Install on office <key> | button | Installs for the office | BIM manager | yes: office key | packs-panel.ts:120 |
| Fork | button | Copies a pack to edit | BIM manager | yes: fork (git term) | packs-panel.ts:121 |
| Cancel / Fork it / Publish | button | Form actions | BIM manager | yes: fork | packs-panel.ts:166-167 |
| Key (e.g. acme-arch) / Display name / Description / Tags | text inputs | Pack fields | BIM manager | yes: key | packs-panel.ts:159-163 |

## 10. QA

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Scan model | button | Runs the standards scan | modeller | yes: standards scan | qa-panel.ts:276 |
| Scanning... | status | Scan in progress | modeller | no | qa-panel.ts:222, 276 |
| Isolate & zoom | button | Isolates the problem element | modeller | no | qa-panel.ts:188 |
| Show all | button | Clears isolate | modeller | no | qa-panel.ts:284 |
| QA / QC - (title) | section | Scan result title | modeller | yes: QA/QC | qa-panel.ts:236 |

## 11. Platform deliveries (status text)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Platform deliveries | title | Platform delivery list | BIM manager | yes: platform | platform-deliveries.ts:1 |
| Gate did not run / Not checked / Running / Passed / Passed (unverified) / Refused | status | Delivery state | BIM manager | yes: gate, unverified | platform-deliveries.ts:37-164 |

## 12. Governed publish and holding area

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| IDS | section | IDS check result | BIM manager | yes: IDS | holding.ts:56, 107 |
| Governed Publish | section | Governed publish of a file | BIM manager | yes: Governed Publish | holding.ts:57 |
| Not uploaded / Nothing was registered | status | File state | modeller | no | holding.ts:78, 110 |
| Upload the corrected file | button | Uploads a corrected file | modeller | no | holding.ts:182 |
| BDS_EXT_ARC_CMU_125 mm | label | Example standard ID shown in a rule | BIM manager | yes: BDS ID | holding.ts:134 |

## 13. Inspection, measure and clip tools (3D tool palette)

Partial: tool-mode-manager, clipper-tool and measurement-tool not fully walked.

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| Clip plane | tool | Cuts the model with a plane | modeller | no | inspection.ts:75 |
| Length / Area / Angle / Volume | tool | Measures | modeller | no | inspection.ts:82-117 |
| Edge / Face | tool | Snaps measurement | modeller | no | inspection.ts:103-110 |
| Drawing clipping plane | tool | Clip plane for a drawing | modeller | no | clipper-tool.ts:129 |

## 14. Evidence source picker (inside Project Files)

| Label | Kind | What it does | Who needs it | Jargon shown? | Source |
|---|---|---|---|---|---|
| My own camera / A map service / A website (Wikimedia Commons, Flickr) | radio | Photo source | modeller | yes: Wikimedia Commons (third-party) | evidence.ts:67-69 |

---

## Internal jargon list

See the counts above. The full per-row list is the Jargon column in sections 1-14.

## Arabic or mixed-language text

None. No Arabic characters in any non-test `.ts` file or in `index.html`. Mixed-language is limited to technical terms (BEP, EIR, IDS, IFC, BCF, CDE) inside English sentences.

## Not walked (to finish the inventory)

- `reality-capture-viewer.ts` (1,383 lines) and the `.3tz` loader UI.
- `files-panel.ts` evidence sub-forms: the state variants of Admit, the scan candidates, drawing alignment (lines 830-850) and the photo marking UI (lines 796-830).
- `clipper-tool.ts` and `measurement-tool.ts` full palettes.
- `workspace` page (layout `Workspace`): the file that builds `workspacePage` was not located in the setups grep.
- Platform built-ins: Explorer tree, Data table, Settings panel, top-viewer toolbar, activity bar.
- Per-category visibility controls (Visibility panel).
- Field-level sub-forms in `standard-forms.ts` and `template-form.ts` (summarised by section).
