# Snowdon lifecycle test roadmap, draft v1 (2026-10-22)

Draft for the founder to correct. Every guess of mine is marked "(my guess)". Test inputs I invent are marked SYNTHETIC.

## 1. How to read this

- The founder plays the client (owner account, hotmail) and the lead appointed party (lead account, gmail). Two more accounts play the task team (decision 7): user4@gmail.com (lead, shares) and user3@gmail.com (contributor, checks). The other Snowdon models stand in for task teams: Structural for STR; HVAC, Plumbing, Electrical for MEP; Site for landscape. Snowdon has no interior model.
- TESTED means done in Session SNOWDON (row id and ledger number given). EXISTS means code or a screen is present but was not run there. PARTIAL means it covers only part of the need. ABSENT means searched and not found (the search is stated).
- Sources used: UK BIM Framework guidance, Part 2 Ed.6, Part E Ed.2, and the CDBB BEP guidance. The ISO text is paywalled and not read. The state names work in progress, shared, published and archive come from ISO 19650-1 Figure 10 as reproduced in UK Guidance Part C (Ed.1); Part C also says the state should be shown by the status code, not by folders.
- Ledger numbers are copied from the Snowdon record. F-SNW-n is finding n in the Snowdon report. Every invented document carries a visible line "SYNTHETIC, exercise only" inside it, so it survives into the audit pack.

Terms: TIDP = task information delivery plan; MIDP = master plan of the same; DTCCA = delivery team capability and capacity summary; LOIN = level of information need; IDS = machine-readable requirements file; BCF = issue exchange format; CDE = common data environment; COBie = asset data sheet; BoQ = bill of quantities; container = one file or model with its ID, state, revision, suitability; Federation Gate = Sentinel's check that the models fit together; Holding Area = where refused files wait; Heal = Sentinel's bulk family repair; S0/S3/A = suitability (status) codes.

## 2. Decisions so far

The founder's decisions:
1. Sentinel serves the architect who answers the tender. The client's EIR, information standard, protocol and reference information are inputs the lead uploads or links. If there is no EIR, the lead drafts it with the client.
2. The founder has never run a bid, so every input is derived from verified references.
3. Client acceptance (5.7.4) is recorded by the same person in Sentinel, as a separate recorded step.
4. The founder knows folder-per-state CDEs (Autodesk Docs). Sentinel keeps state as an attribute of each container version, with a separate folder tree.
5. For Snowdon the client has no EIR. At tender the pre-appointment BEP anticipates the requirements and flags that the project is not following ISO 19650 (Part E p.24). After winning, the lead drafts the EIR with the client in P1, and the client approves it before the BEP is confirmed.
6. Keep one delivery contract per project, as Sentinel works today. The MEP models refused by the architect's contract are recorded as the finding that drives a per-discipline contract in Sentinel; the contract is not weakened to let them pass.
7. Use a three-step review chain: task team check (5.6.3/5.6.4), lead authorization (5.7.2), client acceptance (5.7.4). Four accounts: user4@gmail.com as lead presses Share; user3@gmail.com as contributor approves step 1; yazanhijazeen32@gmail.com as lead approves step 2; yazanhijazeen32@hotmail.com as owner approves step 3, which publishes. Mapping verified against the code in Appendix A.
8. Use the UK 2021 National Annex status codes (section 5).
9. Today an A code needs a new version, because the client's acceptance publishes the container without changing its status code. The test records this as a finding that drives setting the A code at acceptance in Sentinel.
10. Interior (team INT) owns the furniture and finishes inside the ARC model through the responsibility matrix. Snowdon has no interior model. Sentinel assigns a team to a whole container, not to elements inside it, so team-to-element responsibility is recorded as a finding.
11. Three information delivery milestones: M1 Concept/Schematic Design, M2 Design Development, M3 Construction Documents, with SYNTHETIC due dates 2026-12-04, 2027-01-15 and 2027-02-26 (six weeks apart). They are MIDP labels and dates, not Sentinel stages.
12. Teams: ARC (Architectural and Facades models), STR (Structural), MEP (HVAC, Plumbing and Electrical models), SIT (Site, landscape) and INT (interior, inside ARC per decision 10). Team leads use the four accounts of decision 7.
13. Blockers: every gap is recorded. Only a small Sentinel defect that blocks the rest of a phase is fixed, on a branch with tests, and deployed between phases (bridge restart, then the founder's Funnel refresh). Bigger gaps are recorded and the rows that depend on them are marked not run.
14. Federation Gate failures FG-02 (type naming per category, 483) and FG-04 (grid tags, 1): the Raise lock is recorded at M1; both are fixed as the M2 Design Development named change, FG-02 with Naming Manager and FG-04 with one grid edit, so the clash-to-issue path is tested at M2.
15. No fifth account. The live viewer rows (a viewer sees only what its role allows; viewers see Shared before the task team check) are marked not run by choice; finding F-A is shown from the code (0004_auth_rls.sql:149-151).

My assumptions:
- A. Milestones are decision 11. Snowdon is one finished building, so each milestone needs one small named change (see P3).
- B. Decision 3 is met with separate logins, because the database refuses a submitter approving their own share and one person approving two steps of a chain. Decision 7 sets the four-account chain; Appendix A has the verified mapping, setup and runs. user4@gmail.com exists in Supabase (confirmed, never signed in); the founder sets or resets its password.
- C. Blockers follow decision 13. Bridge 4100 was restarted on master 0c530243 on 2026-10-22 at 04:50, so the F-SNW-1 fix (b34baedd) is live locally. The founder refreshes the Funnel once with the bridge up; Claude then checks /health and one page load from the PC.

### Calls I made after the builder check (correct any you disagree with)
- **Project.** A fresh project snowdon-lifecycle; snowdon-towers stays as the Session SNOWDON record. Fresh copies of the seven models in Documents\Sentinel drills\snowdon-lifecycle\; the originals on the Desktop are never touched.
- **Who authors what.** gmail (lead appointed party) writes the P0 BEP, the P1 lead documents and the EIR draft; hotmail approves the EIR as client. Revit is signed in as user4 for every P3 publish, so the task team is the author and gmail stays free to authorize.
- **Team leads.** user4 is the declared lead of ARC, STR, MEP, SIT and INT (one person plays every task team leader). INT owns no container.
- **Container names.** Originator is the team: Facades becomes SNW_ARC_ZZ_XX_M3_A_0002 (not FAC); MEP is one originator with role codes M, P, E; SIT uses role L. The naming standard's allowed lists are set to match before P1.
- **What enters the chain.** At each milestone only versions the referee accepted at registration are shared. Models refused by the one contract (decision 6) stay out, and their MIDP rows stay pending as evidence. The MIDP is 7 containers by 3 milestones, 21 rows. For DD and CD only ARC and STR are re-published, plus any model whose refusal was cleared.
- **Status codes in practice.** Publishes go through Revit Governed Publish (verdict bound, S0). The A-code workaround of decision 9 is shown once, on ARC at M1, by registering a new revision from the CDE board and running it through the chain with a reason; elsewhere the missing code is recorded.
- **Run gate order.** Pressed only at phase ends: after P2 (tender), after M2 is accepted (design), after M3 (coord), after P5 (constr), and the hand gate in P6. A gate that cannot pass is recorded and the run continues at that stage; if the project is stuck at design (no Promote lod_state row), the hand gate in P6 is recorded as unreachable.

## 3. Roadmap at a glance

| Phase | ISO clause | What happens | Main Sentinel area | Input pack ready? |
|---|---|---|---|---|
| P0 Bid response | 5.3 (inputs from client 5.1/5.2) | Lead answers the tender: people, pre-appointment BEP, capability, mobilization, risks | Documents (BEP, READINESS) | No. Aster kit in demo/aster needs renaming to SNW |
| P1 Appointment | 5.4 | Confirm BEP, matrix, lead EIRs, TIDPs, MIDP, appointments | Deliverables, Members, Settings forms | Partly. A7 MIDP rows reusable |
| P2 Mobilization | 5.5 | People, IT and CDE ready; methods rehearsed | Members, PC Settings, CDE board | Mostly. Passwords are the founder's |
| P3 Design production | 5.6 (iterates; each milestone triggers 5.7) | Teams generate, check, approve to share; whole team reviews | Revit tools, Governed Publish, Clash, Issues | Models yes. Every model is published from scratch in the fresh project; no interior model |
| P4 Delivery and acceptance | 5.7, per milestone | Share, authorize, accept, Published | Review chain, CDE, transmittals, audit pack | No. No review standard installed |
| P5 Construction information | 5.2 to 5.7 again | Contractor tender, BoQ, programme, second appointment | Tender, Cost 5D, 4D, Carbon | No. Rates and programme SYNTHETIC |
| P6 Close-out and handover | 5.8 plus asset data | COBie, owner view, archive, lessons | COBie 7D, Owner, hand gate, audit pack | No. COBie is 0/807 assets |

P5 has no appointment entity in Sentinel, so its second appointment is a document-only exercise in the same project (my guess). The client's 5.1/5.2 work is not a phase; it is the input set of P0.

## 4. Phases

### P0 Bid response (5.3)

Purpose: the lead answers a client's invitation with proof it can run the job. The founder wears the lead hat; the client's documents come in as inputs.  
ISO says (guidance, paraphrased): 5.3.1 nominate information management people; 5.3.2 pre-appointment BEP, seven items A individuals, B delivery strategy, C federation strategy, D high-level responsibility matrix, E production method additions, F information standard additions, G software, hardware and IT schedule; 5.3.3 capability and capacity per task team; 5.3.4 delivery team summary; 5.3.5 mobilization plan; 5.3.6 risk register (six heading groups: assumptions, milestones, protocol, delivery strategy, methods and standards, mobilization); 5.3.7 compile the tender response. Part E p.24: if the client gives no EIR, the bidder anticipates it in the BEP and flags that the project is not following ISO 19650.

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| SYNTHETIC client invitation to tender, 1 to 2 pages, with no EIR (decision 5): project brief, scope, programme, tender response requirements | Claude drafts, founder as client approves | .pdf outside Sentinel | 5.2.3, 5.2.4 without 5.2.1 |
| Anticipated information requirements in the BEP: what the lead expects the client to need, the seed of the P1 EIR | Claude | BEP text | Part E p.24 |
| BEP flag: the project is not following ISO 19650 at tender because no EIR was issued | Claude | BEP text | Part E p.24 |
| SYNTHETIC information standard values | Founder decides | Settings forms | 5.1.4 |
| Information protocol summary (6 bullets). The protocol is an appointment document, not BEP content | Claude | .pdf outside Sentinel | 5.4.6, 5.4.7 |
| SYNTHETIC nomination table, 7 functions by named person | Founder (own e-mails) | Text in BEP s2 | 5.3.1; CDBB Table 1.1 |
| Pre-appointment BEP text. Sentinel's 10 headings are its own, not CDBB 2.1 to 2.10, and have no "adjustments to standard or methods" section (5.3.2 E, F): write "no changes" in s3 or s6 | Claude drafts, founder gives real office facts | BEP template, or .docx ingest | 5.3.2 A to G |
| SYNTHETIC capability sheet per team, one summary page | Claude | Text in BEP s2/s9 | 5.3.3, 5.3.4 |
| Mobilization checklist (my guess: about 15 lines, a cut-down subset of CDBB 4.3 A to F, which has about 37 items; I drop the groups the Journey already covers) and risk register (my guess: 10 to 12 rows under the six 5.3.6 headings). ISO treats these as separate resources and one integrated register; the BEP should not carry its own | Claude | Attached .docx or .xlsx; BEP s5/s9 only cross-references them | 5.3.5, 5.3.6 |
| Office readiness: 17 declared items (people, process, standards), plus 13 measured items that need the office snapshot from Revit | Founder, honest | Documents, READINESS | Items 13 to 18 are the nearest evidence for 5.3.3; item 24 asks whether authorization before Published is separate from submission (decision 3) |
| Tender cover sheet, checklist, fee | Claude | Outside Sentinel | 5.3.7 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| Nominate information management people | PARTIAL | Members TESTED (A2). Roles are only owner/lead/contributor/viewer; names live in BEP s2 free text. The BEP s2 prompt cites ISO 5.1, which is the appointing party's own appointment; the lead's nomination is 5.3.1. Product text error |
| Pre-appointment BEP as a document | PARTIAL | Template titled post-appointment, 10 sections. No BEP made in Snowdon (A6, C9 used the EIR) |
| BEP items A to G | PARTIAL | Map to BEP s2, s3, s4, s6, s8, s9 and the Teams tab. None tried. G has no hardware prompt |
| Capability and capacity per team | PARTIAL | TIDP template s6; READINESS is per office |
| Delivery team summary (DTCCA) | ABSENT | Searched bridge, src, SentinelAddin for capability, capacity, DTCCA |
| Mobilization plan | PARTIAL | The 9-step project Journey (team, standards, bep, tidp, model, verdict, published, federated, issued; each done only with an evidence ref) was read in Snowdon (A1 to A3, A10 "2 of 9 done"); office Journey and READINESS also act as checklists. No bespoke plan, no single "mobilization passed" row |
| Risk register | ABSENT | Searched. "Risk tier" exists only on AI changesets (B14) |
| Compile tender response | ABSENT | Tender panel (C11) is client-side BoQ, the opposite direction |
| Client EIR as input, typed | TESTED | A6 Compile to IDS "3 of 5 read", ids@2 3d6e499d2c31; C9 integrity |
| Client EIR as input, upload | EXISTS | docs-panel.ts:424-427, not run |
| "No EIR" case | ABSENT | Searched templates, journey, docs panel. Lead-drafted and client EIRs look the same |
| Information protocol | ABSENT | Searched; no document type or standards kind |

Expected weak points: No place for DTCCA, risks or the protocol: free text or files outside Sentinel. A BEP section cannot be added in the UI. The printed BEP lacks the MIDP and Teams appendices unless pasted. Ingest and Check integrity need local Ollama running (qwen2.5:7b installed). Check it first; E3 (Ollama stopped) was never run. The EIR compiler reads only requirement-shaped sentences (2 of 5 refused in A6). F-SNW-1: the first Settings save on a new project is refused. F-SNW-1b: after that refusal only a browser reload recovers, and it loses the edits.

How we will judge it: Each of 5.3.1 to 5.3.7 has a place in Sentinel or a written ABSENT note. The BEP has all 10 sections filled, carries the anticipated requirements and the non-ISO flag, Check integrity has run, and version 1 is labelled "Pre-appointment (tender)". No EIR exists in the project at the end of P0.

Order of steps (new project; founder as lead; Documents publish needs state moves draft, shared, published and a version label):
1. Start state (my call, builder check): hotmail creates a fresh project snowdon-lifecycle in office snowdon-office. snowdon-towers stays untouched as the Session SNOWDON record. Add gmail and user4 as leads and user3 as contributor here.
2. Founder refreshes the Funnel; Claude checks /health (assumption C).
3. Claude writes the SYNTHETIC invitation (no EIR); the founder approves as client.
4. Create the BEP from the template; paste the pre-appointment text with the anticipated requirements and the non-ISO flag; run Check integrity.
5. Note what Sentinel offers for the no-EIR case (expected ABSENT).
6. Fill the READINESS declared answers; send the office snapshot from Revit for the measured ones.
7. Paste nominations, capability sheets and cross-references to the register and checklist.
8. Publish BEP version 1; Print/PDF. Assemble the tender response outside Sentinel; list what could not be held.

### P1 Appointment (5.4)

Purpose: client and lead agree terms, then the lead passes them down. Outputs: executed appointments, a confirmed BEP, MIDP and TIDPs. The founder wears the client hat for the lead's appointment and the lead hat for the appointed parties'.  
ISO says (guidance, paraphrased): 5.4.1 confirm the BEP; 5.4.2 detailed responsibility matrix; 5.4.3 lead's EIR to each appointed party; 5.4.4 TIDP; 5.4.5 MIDP; 5.4.6 and 5.4.7 complete the appointments, with the information protocol incorporated by an incorporation clause and the Information Particulars completed (Part E p.14), and each appointment holding the standard, methods, protocol and EIR/BEP/TIDP set.

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| Lead-drafted EIR, written with the client from the BEP's anticipated requirements (decision 5). Seven headings follow Sentinel's EIR template, not clause 5.2.1. Use FireRating, IsExternal, space names. SYNTHETIC | Claude drafts as lead; founder approves as client with the owner account | EIR template, or ingest of .pdf .docx .txt .md up to 32 MB (a name with /bep/ is read as a BEP) | Founder decisions 1 and 5; demo/aster client-eir.docx as a pattern |
| A real public EIR (CDBB template or similar) ingested once as an unrigged check of the compiler; the synthetic EIR is written to pass it | Founder picks the file | Same | Test preparation item 8 |
| Change list between BEP v1 and v2 (5 lines), SYNTHETIC, including what changed now that the EIR exists | Claude | Version labels in Documents (published BEP goes back to WIP for v2) | 5.4.1 |
| SYNTHETIC responsibility matrix: systems by team, LOIN per milestone | Claude, founder decides | Pasted table; Declare team form: code, name, lead e-mail, discipline, appointment (lead, delivery or free text), notes | 5.4.2 |
| Team codes first (ARC, STR, MEP, SIT, INT), used identically in the form and the MIDP team column (case-insensitive) | Founder | Both places | check-registry roles.responsibility |
| SYNTHETIC lead EIRs, half a page per team, citing the client clause | Claude | One EIR document per team | 5.4.3 |
| SYNTHETIC MIDP, 7 containers by 3 milestones. Revit publishes are numbered v1, v2, v3 with suitability S0 (Governed Publish sends no revision). Expected revision = v{N}; expect midp.suitability to disagree with S2 as a finding | Claude, dates SYNTHETIC | Tab-separated 7-column rows; stages tender, design, coord, constr, hand, oper | 5.4.5; A7 rows; programme-midp.txt |
| Short TIDP per team, SYNTHETIC | Claude | TIDP template, 7 sections | 5.4.4 |
| Contract as today: one per project, written for the architectural model (decision 6), plus naming and LOD matrix values | Founder decides values | Settings forms | 5.1.4; A4 |
| SYNTHETIC appointment letters "EXERCISE ONLY", with incorporation clause and Information Particulars completed | Claude | .pdf outside Sentinel | 5.4.6, 5.4.7 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| MIDP | TESTED | A7: 7 rows imported "7 pending"; midp.planned true (#3305); STR #3454, #3455, #3459. A7 teams came from the Paste schedule |
| Standards from forms, no JSON | TESTED | A4: naming@1 4161cc4c0429, contract@1 9c21d0cc6dfa, lod_matrix@1 088d7279d2bc |
| Confirmed BEP as a second version | PARTIAL | States and labelled versions exist (bimdocs-logic.mjs:45-54). No pre-appointment marker, no diff |
| BEP section bindings, compliance chips, executability score | EXISTS | docs-panel.ts showBindings, renderExecutability; bind to naming.containers, cde.states, cde.suitability, cde.versioned, gate.stage, midp.milestones, midp.plan_completeness, midp.revision, midp.suitability, roles.responsibility, midp.review, midp.distribution, ids.last_verdict, project.standards_pack. Setting the suitability check is a section binding. READINESS item 19 reads the score. Not run |
| Bindable checks that cannot be checked yet | PARTIAL | loin.levels, qa.scorecard, federation.breakdown always report not_checkable with a stated reason (PLANNED_CHECKS, check-registry.mjs:575). This is BEP s4 federation strategy and s7 LOIN |
| Responsibility matrix | PARTIAL | Teams plus responsible_team. Team-to-container, not element-to-team. roles.responsibility passes only when each declared team has a valid lead e-mail; a paste may create teams without one |
| Lead EIR per party | PARTIAL | An EIR can be made many times; no link to the client EIR. A second Compile replaces the first EIR's checks in the IDS |
| TIDP per team | PARTIAL | Derived "By task team" view and the TIDP template are not linked |
| Programme tools: Rebaseline from the programme, weekly report, slip, 4D task readiness against the MIDP | EXISTS | deliverables-panel.ts:746-808; timeline-panel.ts:39,183. Not run |
| Executed appointments | ABSENT | Searched "appointment": only the form's appointment field (lead/delivery) and notes |
| Protocol, incorporation clause, Information Particulars per appointment | ABSENT | Searched; same as P0 |

Expected weak points: F-SNW-2: Preview accepts stage "DD", Import refuses it. F-SNW-16: all 7 rows stayed "pending" after the ARC publish (C10 not run). Revision mismatch: P01 labels come only from the CDE board (+ Container, Attach) or the intake CLI, never from Revit Governed Publish. F-SNW-12: one delivery contract per project; HVAC was rejected (#3445, #3446; 37 of 37 proxies). Only one EIR drives the IDS at a time.

How we will judge it: The lead-drafted EIR is approved by the owner account before BEP v2 is published, and Compile to IDS reads at least 3 sentences and gives reasons for any it refuses; if Sentinel cannot show who drafted and who approved the EIR, that is a recorded finding. 5 teams (decision 12) are declared and roles.responsibility reports no undeclared team. The MIDP imports with all stages accepted; each row moves off "pending" after its publish, or the mismatch is a recorded finding. BEP v2 "Confirmed" exists beside v1 with a change list. The founder can say where each appointment is recorded.

Order of steps:
0. Lead account drafts the EIR in Documents from the BEP's anticipated requirements; owner account (client) moves it to published; run Compile to IDS. Ingest the public EIR once as the unrigged check.
1. Repeat the A4 forms; run Generate IDS from standards.
2. Declare the teams (codes, lead e-mails, appointment); the paste may create them without leads.
3. Write the lead EIRs and TIDPs. Complete the protocol and Information Particulars per appointment letter.
4. Paste the MIDP; Preview, then Import. Bind BEP sections to checks and read the executability score.
5. Publish BEP v2 "Confirmed" with the change list; record each appointment in BEP s1 (my call: a line in BEP s1 plus the appointment letter PDF outside Sentinel; Sentinel has no appointment record, gap 5).
6. Read the midp.* and roles.responsibility checks.

### P2 Mobilization (5.5)

Purpose: get people, IT and CDE ready and prove the methods work before production. This is the rehearsal.  
ISO says (guidance, paraphrased): 5.5.1 confirm resource availability, deliver education, deliver training; 5.5.2 mobilize and test the team's own CDE, its connection to the project CDE, and information delivery with the client; 5.5.3 test production methods and the container breakdown structure; risks found go in the risk register.

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| Accounts (decision 7): hotmail owner, gmail lead, user4 lead, user3 contributor. user4 already exists in Supabase; the founder sets its password. There is no viewer account, so the viewer rows are not run by choice (decision 15) | Founder | Members form | 5.5.1 |
| Folder tree (by discipline, my guess) | Founder decides | Coordination > CDE: "+ Folder" and the card move-to-folder picker (routes /cde/:key/folders, /cde/containers/:id/folder) | 5.5.3 |
| Status codes: UK 2021 National Annex (decision 8), written in BEP s6 and the cde.suitability allowed list | Founder | BEP s6 text plus check setting | 5.1.4; National Annex NA.4.2 |
| Review chain: three steps as in Appendix A, installed before anything is shared | Founder, via the Review chain form | Web form | 5.1.5 |
| Mobilization lines with a "done when" each, using the Journey steps as the spine. Add lines for education and training (ABSENT in Sentinel) | Claude | Text | P0 checklist |
| Test container: small fixture IFCs (WebApp/bridge/fixtures fed-a.ifc, fed-b.ifc) under an ISO name | Claude | .ifc in the web Files panel | Test preparation item 4 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| Test IT and connection | TESTED | A8 PC Settings; A10; D1 17 MCP tools answered |
| Connection from the lead's PC to the project CDE through Funnel | EXISTS | C15 not run |
| Test sharing and publishing in the CDE | TESTED | C7 WIP to Shared to Published by the owner alone; C8 Holding Area; C1 |
| Confirm people and roles | PARTIAL | A2 TESTED. Roles fixed to four. Readiness declared items not run |
| Education and training | ABSENT | Searched templates, journey, docs panel |
| Test exchange between teams | PARTIAL | B27 ARC and STR published; C3 federation. E4 two seats not run |
| Test production methods end to end | PARTIAL | Governed path ran. No record that teams confirmed the methods |
| Visibility against security | PARTIAL | Roles are project-wide; a viewer sees Shared containers (0004_auth_rls.sql:149-151) |

Expected weak points: F-SNW-14: with no review standard the owner moved WIP to Shared to Published alone. F-SNW-4: the CDE tab shows Aster platform cards on an unlinked project. Second-account sign-in was never driven (A9, B34, C14 not run). The Revit sign-in is the owner today. It is switched to user4 before P3, so publishes carry the task team. The first lead sign-in is the main risk of this phase.

How we will judge it: All four logins sign in. The viewer row is not run by choice (decision 15); F-A is shown from the code. A test container goes WIP, Shared, Published through the three-step chain, with all four accounts on the ledger; one planned rejection raises its BCF topic. Each mobilization line is done or failed with evidence; Journey readout and connection from the lead's PC are recorded.

Order of steps (web: the four accounts in four Chrome profiles, section 5):
1. Founder sets user4's password. Owner checks the members added in P0 (Appendix A setup 3) and installs the three-step chain (setup 4).
2. Run PC Settings tests and open the Journey view.
3. Create the folder tree.
4. Test container: run the full chain once (Appendix A run), then the step 2 rejection rehearsal, then the out-of-order approval rehearsal (F-C).
5. Run the Federation Gate on the fixtures. Mark the lines; list gaps. Press Run gate at the tender stage (Run gate order).

### P3 Design production (5.6), repeated per milestone

Purpose: task teams produce and check information; the whole team reviews the model. ISO defines no design stages; the milestones come from the client's requirements (assumption A). The Share click happens in P4, not here.  
ISO says (guidance, paraphrased): 5.6.1 each team checks reference information and reports any shortfall to the lead (TIDP impact); 5.6.2 generate; 5.6.3 quality check the container wrapper (ID, status, revision, classification); mark checked or reject to the author; 5.6.4 task team reviews against the lead's EIR and TIDP and approves for sharing with a status code; 5.6.5 whole team reviews against the client EIR, acceptance criteria and MIDP.

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| 7 Revit 2025 models under ISO names. Open and bind each with Project Setup (code SNW), one Revit instance at a time (files 22 to 98 MB) | Snowdon provides | .rvt through Governed Publish; web Files panel takes .ifc only | 5.6.2 |
| Fresh copies (my call): copy the 7 models from the Desktop originals to Documents\Sentinel drills\snowdon-lifecycle\ under ISO names, so the Session SNOWDON copies keep their snowdon-towers binding. Every model is published from scratch here | Claude copies | .rvt | Builder check |
| Team map (decision 12): ARC = Architectural + Facades; STR; MEP = HVAC + Plumbing + Electrical; SIT = Site (landscape); INT inside ARC | Founder decided | Team declarations | 5.4.2 |
| A new blank Revit project, not ARC, for Datum from Drawings with A301 (untick about 10 of 19 level rows). Outside the milestone loop | Founder | .dwg through Model from Drawings | B13 |
| 41 DWG files on disk (the "46" in the Snowdon plan, report and record was a miscount, corrected). Titles unverified | Snowdon | .dwg | 5.1.6 |
| Interior (decision 10): team INT owns furniture (345 elements) and coverings/finishes (68) inside the ARC model, written in the responsibility matrix by category | Founder decides, Claude writes the matrix | Team declarations plus BEP matrix text | 5.4.2 |
| One small named change per milestone. At M2 it is the FG-02 and FG-04 fix (decision 14); at M3, for example, a door FireRating edit as in B22. Re-publish only ARC and STR for DD and CD, plus any model whose refusal was cleared (my call, builder check); budget about 1 hour of Revit time per milestone | Claude names it | Revit edit | Same bytes registered again are a repeat, not a version |
| Sheets: rename sheet numbers in Revit to the 7-field ISO name before Publish Sheets, or record the 55 holds again. Run it once, about 20 minutes | Founder | Publish Sheets names PDFs <sheet number>.pdf | F-SNW-7; B28 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| Generate: Scan, Scorecard, Rule Set, Review Flag | TESTED | B1, B2, B3, B7 |
| Datum from Drawings | TESTED | B13: 18 levels and 9 grids from A301 |
| Fix in place | TESTED | B22: FireRating on 6 door types, #3432 to #3436 |
| Container name check | TESTED | E1: bad name refused, #3298 to #3303 |
| Governed Publish | PARTIAL | ARC accepted #3304 to #3311, published "v1 · wip" (B27); STR #3454, #3455, #3459; HVAC rejected #3445, #3446; 4 models not run. Revit versions are v1, v2, v3 with S0; P01/P02/P03 and S-codes need the CDE board (+ Container, Attach) or the intake CLI --revision |
| Ghost Builder | TESTED | B16 FAIL (F-SNW-9) |
| Annotate Views, Promote (DD) | EXISTS | B17, B18 N/A; refused honestly on this model (F-SNW-10a/b); blank guideline and LOD setup |
| 5.6.5 whole-team review | TESTED | C3 gate FAIL on FG-02, FG-04; C4 4335 clashes in 275 groups; B23 4075; C6 RFI. C5 BCF not run |
| Reference information check, shortfall report | PARTIAL | Linked models resolved (B23, 6 links). No shortfall report |
| 5.6.3 container check | PARTIAL | A container's wrapper gets v{N} and S0 at registration. Container-level classification absent |
| Element-level classification | EXISTS | IDS classification facet (ids.ts:40-55); IFC Export Mapping. Not run |
| 5.6.4 approve for sharing with a status code | PARTIAL | Sharing is lead or owner only (C7); contributors cannot share. No code is set at sharing |
| Sheet PDFs | PARTIAL | B28: 55 exported, 0 registered (F-SNW-6, F-SNW-7). A sheet's Revit revision is sent as the version revision, the one route where P-labels reach the CDE |

Expected weak points: F-SNW-12, F-SNW-7, F-SNW-9, F-SNW-10a/b, F-SNW-6 (no progress, Cancel inert). Raise is locked while the Federation Gate FAILs (FG-02, FG-04; C3, C4). Decision 14: record the lock at M1, fix both as the M2 named change. Suitability is free text, frozen after registration (0041). A new revision means a new version. Heal rewrote 222 families with no dry run (F-SNW-3); avoid it (my guess). A 7-model web load is untested (C2 loaded ARC and STR only; PC has an iGPU).

How we will judge it: Each model is published or each refusal is explained by a ledger row (MEP and others refused by the one contract is the expected finding). Per milestone, published containers carry a new version (v2, v3), with the named change recorded. Federation gate and clash run on the live models with every FAIL explained. Sheet PDFs register under a container name, or the failure is recorded.

Order of steps:
1. Bind each fresh copy (Project Setup, snowdon-lifecycle), run Scan and Scorecard. Revit: Sign in as user4 (founder types the password), so the task team is the author of every publish.
2. Governed Publish all seven models for milestone 1; fix what the verdicts hold where it is a model edit; re-publish.
3. Run the Federation Gate, clash, group triage and one RFI. Versions stay WIP (Share is in P4).
4. Publish Sheets once; record the result.
5. Milestones 2 and 3: make the named change (at M2 the FG-02 and FG-04 fix, decision 14, so the clash-to-issue path is tested), re-publish ARC and STR plus any model whose refusal was cleared, repeat step 3.

### P4 Delivery and acceptance (5.7), per milestone

Purpose: move each milestone's information from the lead to the client, who accepts it. The client sees nothing before 5.7.4.  
ISO says (guidance, paraphrased): 5.7.1 submit for lead authorization (task teams); 5.7.2 lead reviews and authorizes; if rejected the task teams amend and resubmit and nothing goes to the client; 5.7.3 submit for acceptance via the project CDE (task teams); 5.7.4 appointing party accepts, container becomes Published with an A code; if rejected the lead is instructed and the relevant appointed party amends; rejection returns to 5.6.1. The approval workflow is project-defined (5.1.5).

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| The three-step chain from P2 (decision 7, Appendix A) | Founder, already installed | Web form | 5.1.5 |
| Status code table (section 5): S1 to S3 for 5.6.5, S4 for 5.7.1, S5 for 5.7.3, A1 to An for Published | Founder | Text and check setting | 2021 National Annex |
| Transmittal per milestone: reference, recipients, purpose, suitability, versions | Claude | POST /cde/:key/transmittals (lead or owner) | 5.7.3 |
| Milestone cut: which versions are accepted. One rejection case at 5.7.2 and one at 5.7.4 (three steps, decision 7). SYNTHETIC | Claude | List in a note | 5.1.3 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| Container states WIP, Shared, Published, Archived | TESTED | C7. State is an attribute of each version |
| Referee verdict at registration (Governed Publish) | TESTED | B27 and E1: ARC #3304 to #3311, STR #3454, #3455, #3459, HVAC rejected #3445, #3446 |
| Verdict predicate on the state move (at Share in chain mode, at Shared to Published otherwise; lead's reason overrides) | EXISTS | 0043_one_project_answers.sql:117-160. C7 moved an already accepted ARC; nothing was refused |
| Multi-step review chain, task team step by role | EXISTS | review@n has 0 to 6 steps {name, role, approvals 1-5}, role contributor, lead or owner (artefact-store.mjs:392-405; standard-forms.ts:106-122). The DB refuses a submitter approving and one person approving two steps. The container is already Shared while the chain runs. Not run (F-SNW-14) |
| Review chain rejection: mandatory note, BCF topic, back to WIP | EXISTS | review-logic.mjs:55-63. Not run |
| midp.review: every published version authorized by someone other than the submitter | EXISTS | check-registry.mjs:544. Would flag the F-SNW-14 same-owner publish. Not run |
| Same login as submitter and approver | ABSENT | review_decide refuses own share and repeat approval (0043) |
| Who may transition | PARTIAL | Lead or owner for every move. Task-team step modelled only by a chain step |
| Status codes | PARTIAL | Free text, default S0; state change does not touch the code |
| Client sees nothing before 5.7.4 | PARTIAL | Viewers see Shared containers |
| Transmittal | PARTIAL | Route and ledger row exist, no web or Revit screen; the Copilot tool list_transmittals is read-only |
| midp.distribution (every published version on a transmittal) and Journey "issued" step | EXISTS | check-registry.mjs:557-566; journey-logic.mjs:112. Next strip stays one step short until a transmittal is POSTed. Not run |
| Audit pack | PARTIAL | C12: Timestamp now verified (DigiCert). Pack download not run; whole project, no per-milestone cut |
| Stage gate | PARTIAL | Tender and hand can PASS or HOLD from the bridge. Design, coord and constr report not_checkable (health, compliance never measured). Design also needs a Promote lod_state row; none exists |

Expected weak points: With no review standard any lead or owner publishes alone (F-SNW-14). Installing the chain is the first step. The A code cannot be written onto an existing version; acceptance would need a new version. Transmittals are API only, which breaks "no JSON for users". RFI close has no two-person rule (C6).

How we will judge it: Per milestone the ledger shows review:start by user4, review:approve 1 by user3, 2 by gmail, 3 by hotmail, then state:shared->published by hotmail, and midp.review agrees. Published shows the chosen code, or the failure is recorded. Each Appendix A finding (F-A to F-G, and F-H if O-3 applies) is confirmed or refuted; F-A is shown from the code (decision 15). One rejection produces a BCF topic and a new version. A transmittal exists, or its absence is recorded. The audit pack verifies offline.

Order of steps (decision 7; details and expected screen text in Appendix A):
1. user4 (lead) shares the milestone's accepted versions. Confirm review:start and the card "Review: step 1 of 3".
2. user3 (contributor) approves step 1; gmail (lead) approves step 2 (5.7.2); hotmail (owner) approves step 3, which publishes (5.7.4). Read the Published card for revision and code.
3. Rejection rehearsals once per run: gmail rejects at step 2, and hotmail rejects at step 3, each with a note. Confirm the BCF topic and the return to WIP; upload a new revision and share it, so the rejection ends in a new version.
4. Issue a transmittal: Claude posts it with the lead's session or the bridge credential after a founder OK; read the Journey "issued" step. Otherwise record ABSENT and skip.
5. After M2 and after M3 only (Run gate order), press Run gate on the current stage. Download the audit pack and run the verifier (founder OK).
6. Read midp.review and midp.distribution.

### P5 Construction-phase information

Purpose: price the model, run a contractor tender, hold programme information, and rehearse a second appointment. ISO defines no construction stage.  
ISO says (guidance, paraphrased): 5.2 to 5.7 repeat for each appointment; 5.1 and 5.8 apply once. A contractor tender is 5.2 (invitation, by the appointing party) and the priced bid is 5.3. Under decision 1 Sentinel serves the bidder, so the Tender panel's client-side direction conflicts with it. Here the founder, as appointing party for a second lead appointment, issues it; the lead issues only when appointing a party under 5.4.7.

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| SYNTHETIC contractor name and priced rate per BoQ line | Claude | Typed in Tender panel | 5.2.3, 5.3 |
| SYNTHETIC programme, 6 to 12 tasks | Claude | .csv name,start,finish,categories[,containers] | demo/aster programme.csv |
| SYNTHETIC carbon factor set | Claude | Carbon panel, Install factors | C11 |
| SYNTHETIC second appointment note, contractor EIR and MIDP, in the same project | Claude | Documents and Deliverables | 5.4 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| Tender from the model BoQ | TESTED | C11: issued, SAR 14,082,334, 9 lines, 0 bids |
| Enter bid, award | EXISTS | Tender panel; no bid entered in Snowdon |
| Cost 5D and Carbon 6D | TESTED | C11: 3,465.3 tCO2e. Demo seeds; F-SNW-5 negative quantities |
| 4D programme | TESTED | C11: 6-trade sequence over 2,642 elements, generated, not from a CSV |
| Programme against MIDP task readiness | EXISTS | taskInformation, GET /deliverables/:key/status. Not run |
| Contractor information with its own review | PARTIAL | Contributors can register versions; the Tender module does not receive them |
| Second appointment cycle | ABSENT | Searched appointment and re-appoint. Stages are one forward list |

Expected weak points: F-SNW-5 spoils any rate check. Rates and carbon factors are demo values. A contractor can only be a member of the same project, not a separate appointed party (my guess).

How we will judge it: A tender is issued, a bid entered, the award recorded, the history shows each step. A CSV programme imports and the 4D player runs it; the link to MIDP readiness is read. The second appointment is described by the founder with its limits listed.

Order of steps:
1. Import the SYNTHETIC programme into 4D; read MIDP task readiness.
2. Cost 5D from the model BoQ with SYNTHETIC rates; note F-SNW-5.
3. Create a tender from the BoQ, issue it, enter a SYNTHETIC bid, award.
4. Write the second appointment note and contractor MIDP in the same project. A second project is a later pass (my guess), with its own members, standards, published model and Revit rebinding.
5. Install carbon factors; read Carbon 6D.
6. Press Run gate at the constr stage (Run gate order).

### P6 Close-out (5.8) and handover of asset information

Purpose: archive the project information model and hand asset data to the client. COBie, Owner view and the hand gate are Sentinel's own handover scope (my guess), not ISO 19650-2 clauses; the guidance names asset information only in a BEP template section (CDBB BEP 2.10).  
ISO says (guidance, paraphrased): 5.8.1 the appointing party archives the project information model as the definitive final version; 5.8.2 capture lessons learned, and the guidance disagrees on who does it, so treat it as shared. The founder does 5.8.1 as client.

Inputs to prepare:
| Item | Who prepares | Format Sentinel accepts | Derived from |
|---|---|---|---|
| SYNTHETIC FM data on a sample of the 807 assets (all doors). Shared parameters named SerialNumber, Manufacturer, InstallationDate, WarrantyStartDate/Duration, mapped in IFC Export Mapping, then IFC Pre-Flight, then Governed Publish | Claude defines, founder sets in Revit | Revit parameters; COBie changes only for the live version | sentinel-core.mjs:757-776 |
| Final list of Published versions | Founder | Note | 5.8.1 |
| Lessons-learned outline (outcomes, metrics, budget, information management, carbon) | Claude drafts | A .docx outside Sentinel; Documents has only BEP, EIR, TIDP, READINESS | Part 2 p.71 |
| Issue and RFI closure list | Claude | BCF .bcf/.bcfzip, founder OK per download | 5.6.5 |

What Sentinel does today:
| Need | Status | Evidence |
|---|---|---|
| COBie 7D | TESTED | C11: 0 % ready, 0/807 assets, 18 floors, 174 spaces |
| Owner view | TESTED | C11: 807 assets, read-only |
| Hand-over gate | EXISTS | GATE_DEFS.hand: RFIs and issues closed, COBie at least 95 %. Would HOLD at 0 % |
| Data feed to the client | PARTIAL | C11 addresses shown; key test not run. Not limited to Published |
| Issue closure by BCF | PARTIAL | C5 not run; RFI closed alone (C6) |
| Deleted items | TESTED | C13: SNW_STR moved; Restore not pressed |
| Archive the project information model | PARTIAL | Container archive is per file (archiveFile). Project Settings has an Archive toggle that only hides the project; delete is refused when published versions exist. The final-version marker is a convention |
| Audit pack | PARTIAL | C12 Timestamp now verified; pack not downloaded |
| Lessons learned | ABSENT | Searched lessons, close-out in src and bridge; no plain-document type (bimdocs-store.mjs:45-48). Only READINESS item 30 |

Expected weak points: COBie at 0 % means the gate cannot pass without invented FM data; a PASS advances the stage, it is not a hand-over. Archiving is container by container. The Owner view has no sign-off.

How we will judge it: COBie readiness rises on the sample, or the reason it does not is recorded; the hand gate's result is explained line by line. Every Published version in the final list is archived or listed; the audit pack verifies offline; lessons learned exist.

Order of steps:
1. Add SYNTHETIC FM data in Revit with the export mapping; Pre-Flight; re-publish.
2. Re-read COBie 7D and load the Owner view.
3. Close issues and RFIs (BCF round trip needs founder OK).
4. Run the hand gate. If the project is stuck at design (no Promote lod_state row), record it as unreachable.
5. Archive the final containers. Move one snowdon-lifecycle container to Deleted items and Restore it; snowdon-towers stays untouched.
6. Download the final audit pack and verify. Test a data feed key (founder's Power BI check).
7. Write the lessons-learned .docx.

## 5. Cross-cutting

Status codes (decision 8: UK 2021 National Annex). S0 work in progress; S1 to S3 shared, aligned with 5.6.5; S4 aligned with 5.7.1 (submit for lead authorization); S5 aligned with 5.7.3 (appointing party review and acceptance); A1 to An Published, with the purpose of each A code set in the information standard; S6, S7 and CR removed. Source: UK Guidance Part 2 Ed.6 section 3.1.10 (pp.84-86), which is internally inconsistent with its own clause pages, and a BIM Toolkit National Annex guidance template; the annex itself (BSI) was not read, so check the exact wording before it goes into a contract. Sentinel today: suitability is free text, default S0, frozen after registration, and the review chain does not change it (Appendix A, F-D). Only cde.suitability checks it, with an allowed list set in the form (default S3, S4); set it to the 2021 list and write the table in BEP s6.

Folders versus states. A container version carries its state; the folder tree is separate. There is no "Published folder". Viewers see Shared containers, so "client sees nothing before acceptance" is a convention here.

Accounts and roles:
| Account | Role | Plays | Signed in on web and Revit |
|---|---|---|---|
| Owner, hotmail | owner | Client; creates the project; approves step 3 (5.7.4) | Chrome profile 1; the PC's Revit sign-in today |
| Lead, gmail | lead | Lead appointed party's authorizer; approves step 2 (5.7.2); declares teams | Chrome profile 2 |
| user4@gmail.com | lead | Task team leader; presses Share; decides nothing | Chrome profile 3; Revit "Sign in" as user4 before P3, so publishes carry the task team |
| user3@gmail.com | contributor | Task team checker; approves step 1 (5.6.3/5.6.4) | Chrome profile 4 |

Stage gates versus milestones. Sentinel has six forward-only stages: tender, design, coord, constr, hand, oper. Milestone names are labels, and the gate cannot move back for a repeat. Mapping (my call, builder check): P0 to P2 are tender; M1 Concept/SD and M2 DD are design, so both sit at "design"; M3 CD is coord (clash coordination, not construction documents); P5 is constr; P6 is hand. The gate is pressed only at these phase ends.

Out of scope: the client's own work in 5.1 and 5.2 beyond the inputs; operation after handover; legal validity of an appointment; real pricing and FM data; counsel-gated web evidence; reality capture (no scan or photos, and the Kladno cloud is another building).

## 6. Product gaps found so far, ranked

| # | Gap | Phase |
|---|---|---|
| 1 | Sharing is lead or owner only; the container turns Shared at the start of a chain; each chain step needs a distinct person; status codes are free text and frozen | P3, P4 |
| 2 | No default review chain (F-SNW-14); a chain needs four people for three ISO steps; viewers see Shared; a step role is a minimum, so a higher role can approve early and stall the chain (F-C); a lead restores Archived to Published with no review (F-B) | P2, P4 |
| 3 | Transmittals have no screen; midp.distribution and the Journey "issued" step depend on them | P4 |
| 4 | One contract per project (F-SNW-12); one EIR drives the IDS | P1, P3 |
| 5 | No appointment record, protocol or second-appointment entity | P1, P5 |
| 6 | Pre-appointment pack missing: DTCCA, mobilization record, risk register, tender compile, no-EIR case; BEP template wording error and no adjustments section | P0 |
| 7 | MIDP rows stay "pending" (F-SNW-16); Preview and Import disagree (F-SNW-2); Revit versions are v{N}, never P01; TIDP forms not linked | P1, P3, P4 |
| 8 | Sheet PDFs always fail the naming rule (F-SNW-7); no progress (F-SNW-6) | P3 |
| 5b | Responsibility is team-to-container only: interior's furniture and finishes inside ARC cannot be assigned to INT (decision 10) | P1, P3 |
| 8b | Client acceptance publishes but cannot set the A status code; the accepted model needs a new version to carry it (decision 9) | P4 |
| 9 | Project archive does not mark a final version; no lessons-learned object; hand gate untested | P6 |
| 10 | Negative quantities (F-SNW-5), Ghost Builder (F-SNW-9), Promote and Annotate (F-SNW-10a/b), grid revert (F-SNW-13) | P3, P5 |

## 7. Open questions for the founder

None open. All fifteen decisions are recorded in section 2.

Answered: "Is 'client has no EIR, lead drafts it' the main scenario?" Yes (decision 5, 2026-10-22). "One contract per project, or one every model passes?" Keep one per project; MEP refusals are the finding (decision 6, 2026-10-22). "Three accounts or a fourth?" A fourth, three-step chain (decision 7, 2026-10-22). "Which status codes?" The UK 2021 National Annex (decision 8, 2026-10-22). "Does an A code need a new version?" Yes today, recorded as a finding (decision 9, 2026-10-22). "How is interior handled?" INT owns furniture and finishes inside ARC; team-to-element responsibility is the finding (decision 10, 2026-10-22). "Which milestones and dates?" Concept/Schematic Design, Design Development, Construction Documents with SYNTHETIC dates six weeks apart (decision 11, 2026-10-22). "How are the models split into teams?" ARC with Facades, one MEP team, STR, SIT, INT (decision 12, 2026-10-22). "What happens when a defect blocks later steps?" Hybrid: record all, fix small blockers between phases (decision 13, 2026-10-22). "FG-02 and FG-04?" Record the lock at M1, fix at M2 (decision 14, 2026-10-22). "A fifth viewer account?" No; viewer rows not run by choice (decision 15, 2026-10-22).

Appendix A comes from a code-reading workflow on 2026-10-22: three readers (database, bridge, web), one planner, one skeptic who made 8 corrections. Citations are file:line in WebApp/db/migrations (0004, 0041, 0043), WebApp/bridge and WebApp/src/setups. They come from the migration files, not the live database.

## Appendix A. Three-step review chain (decision 7), verified against the code
Short names: 0043/0004/0041 = WebApp/db/migrations/…, AS = bridge/artefact-store.mjs, SF = src/setups/standard-forms.ts, PSP = src/setups/project-settings-panel.ts, CP = src/setups/cde-panel.ts, RC = src/setups/review-chain.ts, RL = bridge/review-logic.mjs, MS = bridge/members-store.mjs, CS = bridge/cde-store.mjs. A long dash is written " - ".
### 1. Accounts, roles and ISO actors
Only a lead or owner can share (0043:80-82). The sharer cannot decide any step (0043:278-280). Each person approves once per chain (0043:281-288). Step 3 (owner) can only be decided by hotmail (0043:275-277). So step 2 needs a lead who is neither the sharer nor hotmail.
| Account | Role | ISO actor | In the chain |
|---|---|---|---|
| user4@gmail.com | lead (new) | task team leader, submits | presses Share. Decides nothing |
| user3@gmail.com | contributor (was viewer) | task team checker (5.6.3/5.6.4) | approves step 1 |
| yazanhijazeen32@gmail.com | lead | lead appointed party authorizer (5.7.2) | approves step 2 |
| yazanhijazeen32@hotmail.com | owner | appointing party (5.7.4) | approves step 3, which publishes |
A viewer cannot decide any step (0043:275; 0004:14-16, :30-33), so user3 is promoted.
### 2. Chain to install (review@n, in order; SF:106-131, AS:396-410)
1. "Task team check (5.6.3/5.6.4)", role contributor ("A contributor, lead or owner (not viewers)"), approvals 1
2. "Lead authorization (5.7.2)", role lead ("A lead or the owner"), approvals 1
3. "Client acceptance (5.7.4)", role owner ("The owner"), approvals 1
### 3. Setup (screens only)
1. user4@gmail.com already exists in Supabase auth (confirmed, never signed in); the founder sets or resets its password. Adding by email gives a 404 only when an account does not exist (MS:105-106).
2. hotmail creates the project inside an office, so hotmail is its owner (MS:96-100, comment only). Adding by email is refused on a project with no office (MS:102). Labels (Session SNOWDON A1): Projects hub, "+ New project", project name, appointing party, type Project, office, "Create & open".
3. hotmail: Projects, the project, tab "Settings" (main.ts:310-316), "⚙ Project Settings" (PSP:49), "Members" (PSP:179). In the add row type the email, pick the role (it starts at viewer), press "Add" (PSP:224-251). Add user4 as lead, user3 as contributor, gmail as lead. Each add writes member_added (MS:112). On "already a member - change their role instead" (MS:108), use that row's dropdown. It saves at once and writes member_role_changed (PSP:195-205, MS:126-142).
4. Under "Standards in force", on the review row press "Edit…" (PSP:298). The form "Edit Review chain" opens (SF:528). Press "+ Add a step" (SF:512) three times. Fill in "Step", "Who may approve" and "Approvals needed". New rows start as lead, so set step 1 to contributor and step 3 to owner (SF:112-116). Press "Save as the project's standard" (SF:552). Expect "✓ review@N saved on <key> (sha …)" (PSP:468) and the ledger row artefact_installed review@N (AS:510). Install before anything is shared. The chain is snapshotted when a share starts it (0043:116-131, :185-193), and a version that is already Shared has no chain (0043:97-114).
### 4. One milestone run (Coordination, sub-tab "CDE"; main.ts:393-398)
1. user4 registers the file through the upload path. It starts in WIP and writes created and uploaded (CS:931-1012). "+ Container" then "Create (WIP)" (CP:61, :521-528) also works, but it writes only `created` and has no file or sha256 (CS:641-654). Its share then always needs a reason (0043:146-148).
2. user4 presses "Share →" (CP:34, lead or owner only, CP:345). The share needs an accepted verdict bound to this sha256. Without one, the card says "Not shared - a lead can share it for review with a reason…". Type the reason and press "Share with this reason" (0043:133-178; CP:359-377, :486-494). Expect Shared, then review:start (submitter_uid = user4), then state:wip->shared (0043:185-202). The card shows "Review: step 1 of 3 - Task team check (5.6.3/5.6.4) (contributor)" and "shared for review by user4@gmail.com · review@N" (RC:83; CP:420-421). user4 sees "the submitter does not review their own share" (RL:40-44).
3. user3: "My reviews (1)" (CP:309), then "Approve" (the note is optional). Expect "Approved step 1 of 3 - Task team check (5.6.3/5.6.4) · ledger #… · receipt …", review:approve 1, and "✓ step 1 · user3@gmail.com · ledger …" (RC:86-94; 0043:293-297).
4. gmail presses "Approve". Expect review:approve 2. The state stays Shared.
5. hotmail presses "Approve". Expect review:approve 3, then state:shared->published in the same transaction, with hotmail as the actor (0043:299-303; 0043:68-69). The line reads "Approved step 3 of 3 - Client acceptance (5.7.4) · <container> published · ledger #…" (RC:90-94). The card offers "Archive" to lead and owner (CP:36, :345).
6. midp.review should pass: wip->shared by user4, shared->published by hotmail (check-registry.mjs:366-400, :544-556).
### 5. Rejection rehearsals
- **At step 2:** after step 1, gmail types a note and presses "Reject". The button is disabled while the note is blank (CP:431-435). Expect review:reject 2, then state:shared->wip with the note "review: rejected at step 2 - <note>", which closes the chain (0043:289-305). The bridge then raises a High BCF Issue, "Review: <container> rejected at step 2 - <note>". It has no assignee and is authored by gmail. A failure there never undoes the decision (bcf-service.mjs:1569-1582; RL:58-64; CS:2316-2332). The status line reads "Rejected at step 2 of 3 - Lead authorization (5.7.2) · <container> back to WIP · ledger #… · BCF topic <guid>" (RC:90-94).
- **At step 3:** repeat steps 1 and 2, then hotmail rejects with a note. The same rows appear, with step 3.
- **Coming back:** the same version is back in WIP, and its record cannot be edited (0041:5-8, :66-71). Either share it again unchanged, or "⎘ Replace" / upload a new revision (CP:391-397) and share that. Each share opens a new chain (new review:start). The once-per-person rule counts per chain (0043:246-257, :281-288).
### 6. Where Sentinel differs from ISO 19650-2 (record each as a finding)
- F-A: The container is Shared, and every member can read it including viewers, before the task team check (0004:149-151; 0043:84-90).
- F-B: The submitter needs the project-wide lead role. A contributor cannot share (0043:80-82). The same role installs standards (AS:528) and archives. It also restores Archived to Published with no review, only a verdict or a reason (0043:80, :88, :133). Under a chain a direct Publish is refused (0043:105-108).
- F-C: A step's role is a minimum (0043:275-277). While step 1 is open, gmail and hotmail also see "Approve" (RL:40-44, CP:423). If gmail or hotmail approves an earlier step, step 3 has no one left. An earlier approver cannot reject later either (0043:281-291). The chain stalls until "← Back to WIP (ends the review)" (RC:37). Rehearse this once.
- F-D: Publishing changes only the state. Revision and suitability stay as registered (0043:182; 0041:5-8, :66-71).
- F-E: "← Back to WIP (ends the review)" asks for no note. The state row's note is the button label. There is no review:reject row and no BCF topic (0043:96-114; CP:352, :482-486).
- F-F: Steps have no organisation or task-team scope. Roles are project-wide (0004:23-33).
- F-G: No notification goes to the next approver. Each one has to check "My reviews" (0043:299-306; bcf-service.mjs:1568-1582).
### 7. Open items
- O-1 (answered from Session SNOWDON A1): Projects hub, "+ New project", project name, appointing party, type Project, office, "Create & open". File upload labels were not read.
- O-2: A share into a chain, and every decision, needs the bridge to forward the session (SUPABASE_ANON_KEY) (0043:125-129; CS:1675). The live environment was not checked.
- O-3: How a new project gets an accepted verdict with a named ids_ref and an in-scope count above zero (0043:146-148). Without one, every share needs a reason (F-H if so).
- O-4: Running "judge again" during a chain can make the final approval fail and roll back, unless the share carried a reason (0043:133-178, :303).
- O-7: What platform-state.mjs writes to the That Open item at publish (mirrorStateSafe, CS:1682) was not read.
- O-8: Everything comes from the migration files, not the live database (0043 says it was applied on 2026-10-07).
