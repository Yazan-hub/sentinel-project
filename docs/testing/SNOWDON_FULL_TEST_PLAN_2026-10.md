# Snowdon Towers full test plan (2026-10-22)

One pass over every Sentinel tool and workflow on a real multi-discipline project: Autodesk's Snowdon Towers sample
(Revit 2025, seven models + 46 DWG sheets). Also the rehearsal for an outside office's first run.

**Inputs.** Originals stay untouched in `Desktop\Sentinel Test Folder\Snowdon Tower`. Scratch copies in
`Documents\Sentinel drills\snowdon\` (7 × .rvt, `DWG\*.dwg`). Models: Architectural (98 MB), Structural, HVAC, Plumbing,
Electrical, Facades, Site. DWGs: A1xx plans, A2xx elevations, A3xx sections, G/K/SD/C sheets.

**Seats.** Revit 2025 (add-in already deployed from master to 2021–2027 at 00:10 today; Revit 2024 is open at Home and
will be closed, nothing in it). Local web app :4000 (Chrome), published app through the Funnel for the two remote rows.
Bridge 4100 up (`/health` 200), Ollama up.

**Rules.** Every row ends pass / fail / n/a with the reason and evidence (ledger #, screenshot, Doctor line). Sign-ins,
passwords, downloads and the Funnel refresh are the founder's: the screen is prepared and asked once. Small bugs are
fixed on a branch with tests and merged after the secret scan; bigger ones are listed. Revit never opens twice; nothing
the founder opened is discarded. Results are recorded as Session SNOWDON in SIMULATION_ROOM_RUN_2026-09-22.md and
summed up in SNOWDON_FULL_TEST_REPORT_2026-10.md.

**Scope note.** Snowdon ships with no EIR, BEP, MIDP, programme, photos or point cloud. Rows that need them use the
Aster test kit (`SentinelData\test-kit`) or a short synthetic input and say so. Rows marked *N/A* are not driven.

## A. Set-up (web first, then Revit) — the order a new office would take

| # | Where | Tool / workflow | Done means |
|---|---|---|---|
| A1 | Web Projects | + New project `snowdon` with ISO naming, office `snowdon-office` | project opens; Dashboard + Next strip show the first step |
| A2 | Web Settings | Members: owner + lead (second account) + viewer | roles shown in My role; viewer cannot write (C14 later) |
| A3 | Web Standards | Packs: Install the office pack into the project | pack listed as in force |
| A4 | Web Settings forms | Naming rules (ISO 19650 fields for SNW), contract, protection, modelling guideline, IFC export mapping, LOD matrix, AI privacy — each via its screen, no JSON | each artefact saved, version shown, ledger row |
| A5 | Web Settings | Generate IDS from standards | ids artefact installed, specs listed in words |
| A6 | Web Documents | + New EIR (Aster EIR text) → Compile to IDS → installs beside the generated IDS | no spec lost (eir_skipped shown if any) |
| A7 | Web Deliverables | Declare team; paste a 6-row MIDP (one per discipline) | rows with dates; TIDP per team |
| A8 | Revit 2025 | Standards ▸ PC Settings: Test bridge, sign-in, local AI, folders; Save | all tests green |
| A9 | Revit | Standards ▸ Sign in (founder types the password) | signed in as founder; actor on later rows |
| A10 | Revit | Project Setup on the ARC copy: bind to `snowdon`, code SNW, ghost folder = DWG copy | Save confirms; pane shows the project journey |
| A11 | Revit | Coordinate ▸ Show Panel | rule results, journey, Doctor log |

## B. Model workflows in Revit 2025 (ARC model unless stated)

| # | Tool | Input | Done means |
|---|---|---|---|
| B1 | Validate ▸ Scan Now | ARC | score strip + issue list; count recorded |
| B2 | Health Scorecard | ARC | per-domain breakdown |
| B3 | Rule Set | ARC | lists the rules in force with name/version/origin (matches A3–A4) |
| B4 | Naming Manager | ARC families/types | verdicts per row; rename 2 ticked rows; ledger accepts; Rescan |
| B5 | Family Health ▸ Heal Loaded Families | ARC | report; auto-fix count; "needs a person" list |
| B6 | Family Health ▸ Sanitize .rfa | one family saved out of ARC | verdict (pass or named reasons) |
| B7 | Review Flag | ARC | ZZZ_ReviewStatus created once; second run says so |
| B8 | Protection window | protect grids/levels/structure, Save for project | saved; later changeset on a grid refused (B14) |
| B9 | Modelling Guideline window | edit one rule, Save for project | web Settings shows the version |
| B10 | IFC Export Mapping window | add one pset property from a Revit parameter, Save | shown in web; used by B27 |
| B11 | IFC Gate ▸ IFC Pre-Flight | ARC | report of missing Export-As / contract properties |
| B12 | IFC Gate ▸ IFC Delivery Gate | ARC export | verdict on the ledger; row visible in web |
| B13 | Model from Drawings ▸ 1 Datum from Drawings | A301 (section) + A101 (plan) DWG, in a new blank project `SNW-scratch` | proposed levels/grids; ticked rows only; compare to ARC's |
| B14 | Review AI Proposals | an MCP-proposed changeset touching a protected grid (see D3) + a normal wall changeset | risk tiers shown; protected op refused; normal applied in one Undo |
| B15 | Applied AI Changes | B14's changeset | saved check (changeset_confirmed after save); Check revert dry-run; Revert |
| B16 | 2 Ghost Builder | A102 plan DWG in `SNW-scratch` | review window; ticked rows only; LOD 200 walls; stamps; imported DWG removed |
| B17 | 3 Annotate Views | `SNW-scratch` levels | preview, one Undo entry |
| B18 | 4 Promote (DD) | the ghost walls | plan dialog No (read-only) then Yes; one storey; holds in web Holding Area |
| B19 | 5 Provenance | a promoted wall | stamp in words |
| B20 | 2b Photo Massing / 2c Shell a Mass | *N/A unless the Aster photos are accepted as stand-ins*: run 2c on a mass in ARC if present | changeset filed or N/A reason |
| B21 | Coordinate ▸ Change Requests | raise one from the web, approve in Revit | request shown; Approve lands |
| B22 | BCF Issues (native) | + New issue from selection; snapshot; quick edit + comment; Fix in Revit on a referee issue | issue on web; history "recorded in the ledger #N" |
| B23 | Clash ▸ Clash Manager | ARC with HVAC + STR linked | clashes graded; 3D clash view; Export BCF |
| B24 | Clash Register | after C4 | read-only counts agree with web |
| B25 | MEP Openings | ARC + linked HVAC/Plumbing | candidates after 150 mm merge; place voids; Ctrl+Z; BCF export |
| B26 | MEP Type Check | HVAC model | per-type verdicts vs catalogue; ledger row |
| B27 | Governed Publish | ARC, STR, HVAC, PLB, ELE, FAC, SITE (7 runs) | IFC export + gate + IDS/naming + registered version each; time per model noted |
| B28 | Publish ▸ Publish Sheets | ARC | sheets + PDFs in web Sheets; PDFs proposed to the register |
| B29 | Publish ▸ Publish Views | ARC, 3 ticked views | web Views |
| B30 | Auto-publish on save | ARC save | new version with no button press |
| B31 | Build Office System / Apply Standard | ARC as golden → blank project | pack built; Apply lands in blank |
| B32 | Ingest Docs | Aster standards PDF (local LLM) | proposals to review; no outbound call |
| B33 | ROI Dashboard | project | counts from the ledger |
| B34 | Sign out + Governed Publish | ARC | refused with the signed-out reason; sign in again |

## C. Web workflows (local app, signed in as founder; viewer account for C14)

| # | Panel | Done means |
|---|---|---|
| C1 | Project Files: 7 published models listed, ISO names, states | versions, MIDP links, live set |
| C2 | Open 3D / federation: all 7 loaded; Browser; Properties; Visibility (IDS colouring) | loads; Performance readout (Measure 10 s) recorded |
| C3 | Federation Gate on the set | pass/fail with reasons (shared GUIDs, levels, grids, georef) |
| C4 | Clash: Run clash ARC×HVAC, Groups, owners, Pair only, Mark not a clash, Raise group → one Issue, Propose deleting copies on a duplicate group | rows + ledger |
| C5 | Issues: list, Send to Revit, Export BCF 2.1 + 3.0, Import the export back, Close all as superseded | round trip |
| C6 | RFIs: raise, answer, approve & close | ledger rows |
| C7 | CDE: containers, folders, WIP→Shared→Published transitions, review chain (two accounts), Rotate key, Unlock | ISO states; second-account review |
| C8 | Holding Area: B18's holds listed with reasons; dismiss one | |
| C9 | Documents: EIR/BEP from A6, bindings, integrity check, readiness | |
| C10 | Deliverables / MIDP: status, slip, weekly report, CSV | |
| C11 | Lifecycle: 4D Sequence (synthetic 6-row programme), Cost 5D take-off, Carbon 6D (install factors), COBie 7D hand-over gate, Tender from BoQ, Owner, Data feed key + `elements.csv` over Basic | each panel produces rows from the Snowdon models |
| C12 | Settings: standards in force + versions, version checks (stale save → 412 in words), audit pack + verifier download (founder OK), Timestamp now, AI privacy lock | |
| C13 | Deleted items: delete a model, restore it | |
| C14 | Viewer account: every write refused in words | |
| C15 | Published app through the Funnel: sign in, open 3D of one model, one issue edit (Funnel refresh = founder) | |
| C16 | Sheets / Views tabs from B28/B29; Live plan; MIDP on sheet rows | |

## D. AI / MCP

| # | Tool | Done means |
|---|---|---|
| D1 | MCP read-only: list_projects, audit, compliance_report, deliverables_status, standards, lod_state, changeset_status, list_checks, edit_cost | answers for `snowdon` |
| D2 | sentinel_propose: 3 elements vs the IDS | verdict on the ledger |
| D3 | sentinel_propose_changeset: one wall create + one grid move (protected) | staged; B14 reviews both |
| D4 | sentinel_ask_app | refused in words when AI-on-network lock is on (A4), answers when off |
| D5 | sentinel_doc_integrity on the EIR | suggestions only |
| D6 | Ask Sentinel (web Copilot): 3 questions with source check | cites; nothing pre-ticked |

## E. Adversarial / outside-office rows

| # | Row | Done means |
|---|---|---|
| E1 | Publish a model with a name that breaks the ISO rule | refused in words |
| E2 | Bridge stopped mid-action in Revit | told in words, nothing half-written |
| E3 | Ghost Builder with Ollama stopped | told to start it |
| E4 | Two seats editing the same element (Revit + web proposal) | claim refused |

Counts: A 11 · B 34 · C 16 · D 6 · E 4 = 71 rows.
