# P0-02 Pre-appointment BIM Execution Plan: Snowdon Towers (SNW)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real tender.

**How to use this file.** Each `##` heading below is one section of the Sentinel BEP template (`WebApp/bridge/templates/bep-template.json`), with the same number and title. Paste the text under each heading into that section. Label version 1 "Pre-appointment (tender)". The template's own title says "post-appointment"; this text is the pre-appointment version (ISO 19650-2 5.3.2). Every invented value is marked SYNTHETIC. Pack siblings: P0-03 capability sheets, P0-04 mobilisation checklist, P0-05 risk register.

**Mapping.** 5.3.2 items A to G are from (Part E pp.25-26). CDBB sections are from the BIM Toolkit pre-BEP guidance (CDBB BEP p.ii).

| Sentinel section | 5.3.2 item | CDBB pre-BEP section |
|---|---|---|
| 1 Project information | (context) | 1.1 Project description; 1.2 Scope and collaboration goals |
| 2 Roles, responsibilities and authorities | A individuals; D responsibility matrix | 1.3 IM responsibilities (Table 1.1); 2.2 Organisational structure; 2.3 Responsibility matrix |
| 3 Information delivery strategy | B delivery strategy | 2 Information delivery strategy; 2.1 Objectives; 2.7 Risk register (cross reference only) |
| 4 Federation strategy and model breakdown | C federation strategy | 2.5 Federation strategy |
| 5 CDE and workflow | E production methods (review chain) | 3.2 Production methods and procedures; 2.8 Mobilisation (cross reference only) |
| 6 Container naming and standards | F information standard | 3 Standards/methods adjustments; 3.1 Information standards; 3.1.1 Container ID conventions |
| 7 Level of information need (LOIN) | B (response to level of information need) | 2.6 Information delivery plans |
| 8 Methods and procedures | E production methods | 3.2 Production methods and procedures |
| 9 Software and versions | G software, hardware and IT | 2.4 Schedule of software |
| 10 Quality assurance and model checking | E production methods | 3.2.1 Coordination strategy; 3.2.3 Information model quality |

---

## 1. Project information

- **Project:** Snowdon Towers. **Project code:** SNW.
- **Description:** a mixed-use tower. The models are Autodesk's Snowdon Towers sample; its cover sheet gives Brownsville, PA. Used here as an exercise building only.
- **Appointing party (client):** Snowdon Developments (sample). SYNTHETIC. Account yazanhijazeen32@hotmail.com.
- **Prospective lead appointed party:** Snowdon Office, an architectural practice (Sentinel office key `snowdon-office`). SYNTHETIC. Information management: Yazan Hijazeen, account yazanhijazeen32@gmail.com.
- **Appointment (SYNTHETIC scope):** one appointment covering design from Concept/Schematic Design to Construction Documents (M1 to M3). One delivery contract per project (founder decision 6).
- **Key dates (all SYNTHETIC):**

| Event | Date |
|---|---|
| Invitation to tender issued | 2026-10-26 |
| Tender return | 2026-11-06 |
| Award | 2026-11-13 |
| Mobilisation | 2026-11-16 to 2026-11-25 |
| M1 Concept/Schematic Design | 2026-12-04 |
| M2 Design Development | 2027-01-15 |
| M3 Construction Documents | 2027-02-26 |

## 2. Roles, responsibilities and authorities

The template prompt cites ISO 19650-2 5.1. That clause is the appointing party's own work. A bidder's nominations are 5.3.1, "the appointment level equivalent of clause 5.1.1" (Part 2 p.41).

**5.3.1 nomination table** (functions verbatim from CDBB BEP p.3, Table 1.1, typos kept). One appointed party, Snowdon Office, provides all five task teams. Accounts are real test accounts; organisations are SYNTHETIC.

| # | Information management function | Name / account | Task team | Email |
|---|---|---|---|---|
| 1 | Nominate individuals to undertaken [sic] the information management function | Yazan Hijazeen | Lead (Snowdon Office) | yazanhijazeen32@gmail.com |
| 2 | Establish the delivery team's (pre-appointment) BIM execution plan | Yazan Hijazeen | Lead | yazanhijazeen32@gmail.com |
| 3 | Assess task team capability and capacity | Task team leader (no name given, SYNTHETIC) | ARC, STR, MEP, SIT, INT | user4@gmail.com |
| 4 | Establish the delivery team's capability and capacity | Yazan Hijazeen | Lead | yazanhijazeen32@gmail.com |
| 5 | Establish the delivery team's mobilization plan | Yazan Hijazeen | Lead | yazanhijazeen32@gmail.com |
| 6 | Establish the delivery team's risk register | Yazan Hijazeen | Lead | yazanhijazeen32@gmail.com |
| 7 | Compile the delivery team's tender response | Yazan Hijazeen | Lead | yazanhijazeen32@gmail.com |
| 8a | Added: task team check before information leaves the team (ISO 19650-2 5.6.3/5.6.4) | Task team checker (no name given, SYNTHETIC) | All teams | user3@gmail.com |
| 8b | Added: lead authorization of information for the client (5.7.2) | Yazan Hijazeen | Lead | yazanhijazeen32@gmail.com |

Rows 8a and 8b fill the template's "<Insert task.>" row. The checker and the authorizer are different people, so no one checks and authorizes the same work (our own control; Sentinel also refuses one person approving two steps). Evidence of competence for each person is in P0-03.

**High-level responsibility matrix (5.3.2 D).** P = produces, C = checks, A = authorizes. The client accepts at each milestone (5.7.4). INT works inside the ARC model and has no container of its own.

| Deliverable (information model element) | Team (P) | C | A | M1 Concept/SD | M2 DD | M3 CD |
|---|---|---|---|---|---|---|
| Architectural model | ARC | user3 | gmail | Yes | Yes | Yes |
| Facades model | ARC | user3 | gmail | Yes | Yes | Yes |
| Furniture (345 elements) and coverings/finishes (68) inside the ARC model | INT | user3 | gmail | No | Yes | Yes |
| Structural model | STR | user3 | gmail | Yes | Yes | Yes |
| HVAC, Plumbing, Electrical models | MEP | user3 | gmail | Yes | Yes | Yes |
| Site and landscape model | SIT | user3 | gmail | Yes | Yes | Yes |
| IFC 2x3 export of each model above | Owning team | user3 | gmail | Yes | Yes | Yes |
| Sheets as PDF | ARC (others as needed) | user3 | gmail | No | No | Yes |
| BEP, MIDP, coordination issues | Lead | n/a | gmail | Yes | Yes | Yes |

The M1/M2/M3 "Yes/No" cells are SYNTHETIC proposals. Element counts are from the sample model. Sentinel assigns a team to a whole container, not to elements inside it, so INT's share is written here only (founder decision 10).

## 3. Information delivery strategy

**Flag to the client: this project is not following ISO 19650 at tender.** The invitation carries no exchange information requirements (EIR). UK guidance says the bidder should write a BEP that anticipates the EIR, and should tell the client that "the project is not following ISO 19650" so that both sides resolve it together (Part E p.24). We propose to draft the EIR with the client after award, for the client's approval before this BEP is confirmed.

**Anticipated information requirements** (SYNTHETIC; the client confirms or changes each one in the EIR):
1. Each model is delivered as IFC 2x3 at M1, M2 and M3, one file per container.
2. Walls carry FireRating (IFC property set Pset_WallCommon).
3. Walls carry IsExternal (Pset_WallCommon), true for walls on the building envelope.
4. Doors carry FireRating (Pset_DoorCommon).
5. Spaces carry a name (the Revit room name, which Revit's IFC export writes to IfcSpace LongName; Name holds the room number).
6. Information grows by milestone, as set out in section 7.

**Objectives (CDBB 2.1).** One shared, checked set of models per milestone. Every container named to section 6. No container reaches the client without a task team check and a lead authorization. Every state change recorded on the Sentinel ledger.

**Organisation and task team split (5.3.2 B).** One appointed party, Snowdon Office, provides five task teams. Part E p.25 names this case: "one appointed party providing several task teams".

| Team | Scope | Models (containers) |
|---|---|---|
| ARC | Architectural and Facades | 2 |
| STR | Structural | 1 |
| MEP | HVAC, Plumbing and Electrical, one team | 3 |
| SIT | Site and landscape | 1 |
| INT | Interior: furniture and finishes inside the ARC model | 0 (works in ARC) |

The task team leader account user4@gmail.com leads every team and shares their containers. The checker account user3@gmail.com checks them.

**Federation strategy (high level).** Models are split by team and then by discipline model, and federated as IFC in the Sentinel web viewer. Detail in section 4.

**Risks.** Information delivery risks are in one integrated register, P0-05. This BEP does not carry its own, following "the BEP should not feature a supplementary risk register" (Part 2 p.46).

## 4. Federation strategy and model breakdown

- **Split:** by task team, then by discipline model (role then task, CDBB BEP pp.7-8). One volume for the whole building (ZZ), since the sample is not split by zone.
- **Models:** 7 containers. ARC: Architectural, Facades. STR: Structural. MEP: HVAC, Plumbing, Electrical. SIT: Site. Names in section 6.
- **Federation:** each model is exported to IFC 2x3 and loaded together in the Sentinel web viewer (That Open). Native Revit links are used inside Revit for day-to-day coordination.
- **Frequency (SYNTHETIC):** at every Shared version and at each milestone.
- **Clash workflow:** run clash in Revit (Sentinel Clash Manager) and in the web viewer. Group clashes, give each group an owner team, and raise one coordination issue (BCF) per group. A group judged "not a clash" is closed with a reason.
- **Measured on the sample (real, Session SNOWDON):** web clash of ARC and STR found 4335 clashes in 275 groups. ARC loads in the viewer in 2.3 s, STR in 1.1 s. A load of all 7 models has not been tested.

## 5. CDE and workflow

- **CDE:** Sentinel. A container version carries its state: WIP -> Shared -> Published -> Archived. The folder tree is separate from state.
- **Proposed addition to production methods (5.3.2 E): a three-step review chain.** The Sentinel template has no "adjustments to methods" section, so the addition is placed here and in section 8.

| Step | Who | Account | Clause |
|---|---|---|---|
| Share | Task team leader presses Share | user4@gmail.com | starts the chain |
| 1 Task team check | Contributor | user3@gmail.com | 5.6.3/5.6.4 |
| 2 Lead authorization | Lead | yazanhijazeen32@gmail.com | 5.7.2 |
| 3 Client acceptance (publishes) | Owner | yazanhijazeen32@hotmail.com | 5.7.4 |

- The sharer cannot approve any step, and one person approves once per chain. A rejection sends the version back to WIP and raises a coordination issue.
- **Known limits, stated now:** in Sentinel a container is already Shared, and readable by all members, before step 1. Acceptance publishes without changing the status code, so an A code needs a new version (founder decision 9).
- **Mobilisation:** the chain is installed, and every CDE test is run, before any work is shared. See P0-04. Without the chain, one person could take a container from WIP to Published with no review (finding F-SNW-14).

## 6. Container naming and standards

**Proposed additions to the information standard (5.3.2 F).** The Sentinel template has no "adjustments to the standard" section, so the additions are placed here. They are additions, not amendments (Part E p.21). They are put forward as a contract negotiation, so that the client can make them known to all bidders (Part E p.19).

**Container naming (SYNTHETIC code lists):** `SNW_<originator>_<volume>_<level>_<type>_<role>_<number>`

| Field | Values proposed |
|---|---|
| Originator | the task team: ARC, STR, MEP, SIT (a proposal; all teams sit in one organisation) |
| Volume | ZZ (whole building) |
| Level | XX (the model covers more than one level) |
| Type | M3 (3D model); others to agree at mobilisation |
| Role | A architect, S structural, M mechanical, P plumbing, E electrical, L landscape |
| Number | 0001 upwards |

Containers: SNW_ARC_ZZ_XX_M3_A_0001 (Architectural), SNW_ARC_ZZ_XX_M3_A_0002 (Facades), SNW_STR_ZZ_XX_M3_S_0001, SNW_MEP_ZZ_XX_M3_M_0001 (HVAC), SNW_MEP_ZZ_XX_M3_P_0001 (Plumbing), SNW_MEP_ZZ_XX_M3_E_0001 (Electrical), SNW_SIT_ZZ_XX_M3_L_0001. INT has no container. These match the renamed copies already on disk. The meanings of the volume, level, type and role codes are our proposal and must be checked against the National Annex, which was not read. Sheet PDFs must also follow this rule; today they are named by sheet number and were refused (F-SNW-7), so this is a mobilisation task (P0-04).

**Status codes: UK 2021 National Annex** (founder decision 8). Wording below must be checked against the annex before it enters a contract; the annex itself was not read.

| Code | State | Use |
|---|---|---|
| S0 | WIP | work in progress |
| S1 to S3 | Shared | shared for coordination, information, or review and comment |
| S4 | Shared | submitted for lead authorization (5.7.1) |
| S5 | Shared | submitted for client review and acceptance (5.7.3) |
| A1, A2, A3 | Published | accepted at M1, M2, M3 (SYNTHETIC purposes) |

Status codes and container codes are to be agreed with the client (UK BIM Framework Guidance Part C pp.28-29).

## 7. Level of information need (LOIN)

There is no client EIR, so there are no client LOIN tables to reference (section 3). Proposed LOIN per milestone, SYNTHETIC, for the client to confirm:

| Milestone | Geometry | Information |
|---|---|---|
| M1 Concept/SD, 2026-12-04 | Main walls, floors, roofs, cores, grids, levels; spaces placed | Space names; walls IsExternal |
| M2 DD, 2027-01-15 | Doors, windows, structure and main MEP routes modelled; INT furniture placed | Walls FireRating and IsExternal; doors FireRating where known |
| M3 CD, 2027-02-26 | Coordinated models for construction documents | FireRating on all walls and doors; all spaces named; sheets as PDF |

## 8. Methods and procedures

- **Additions (5.3.2 E):** the three-step review chain (section 5) is our proposed addition to the production methods. No other changes are proposed; we state this as CDBB BEP p.12 asks.
- **Modelling:** one Revit model per container, linked by team. Interior work is done inside the ARC model by INT.
- **Shared coordinates and units:** keep those carried by the sample models; confirm at mobilisation (P0-04).
- **Classification:** none proposed at tender; the client to state one in the EIR.
- **Before sharing:** each model passes the section 10 checks.

## 9. Software and versions

**Software (CDBB Table 2.2 columns).**

| Information type | Software | Native format | Version |
|---|---|---|---|
| Models and drawings | Autodesk Revit | .rvt | 2025.4 (frozen for the appointment) |
| Model exchange | IFC export from Revit | .ifc | IFC 2x3 |
| CDE, checks, ledger | Sentinel: Node bridge, Postgres ledger with a daily RFC 3161 timestamp (a trusted time stamp) | n/a | current release |
| Revit add-in | Sentinel add-in | n/a | builds for Revit 2021 to 2027 |
| Web viewer and federation | Sentinel web app on That Open | IFC, .frag | 1.0.110 |
| Coordination issues | Sentinel issues | BCF | 2.1 and 3.0 |
| Local AI (reading documents, checks) | Ollama, running on the PC | n/a | qwen2.5:7b model |
| Sheets and documents | PDF | .pdf | n/a |

**Hardware (real values, exercise PC).** Intel Core i9-13900HX (24 cores, 32 threads), 31.7 GB RAM, NVIDIA GeForce RTX 4060 Laptop GPU plus Intel UHD Graphics, Windows 11 Home 10.0.26300, 139.7 GB free of 929.3 GB on C:. Revit 2023 to 2027 program folders are present. Revit 2025 opens the ARC model (about 98 MB) in about 90 s.

**IT infrastructure.** The Sentinel bridge runs on the lead's PC and is reached over a Tailscale Funnel link (a public address for that PC). Backups are not yet defined; see P0-04 and P0-05.

**Upgrade policy.** No Revit upgrade during the appointment. During the appointment Sentinel gets only small fixes for defects that block a phase, deployed between phases with a bridge restart and a Funnel refresh; bigger gaps are recorded, not fixed (founder decision 13).

**Capability.** Each task team's capability and capacity to use this software is in P0-03.

## 10. Quality assurance and model checking

Who runs each check and the pass criteria are SYNTHETIC proposals for the client to confirm.

| Transition | Check | Run by | Pass when |
|---|---|---|---|
| WIP -> Shared | Container name against the section 6 rule | Sentinel, on registration | name conforms |
| WIP -> Shared | Governed Publish: IFC export checked against the project's delivery contract | user4, in Revit | verdict accepted |
| WIP -> Shared | IFC Pre-Flight and clash run (section 4) | user4 | no new unassigned clash groups |
| Shared, step 1 | Task team check | user3 | approved |
| Shared, step 2 | Lead authorization | gmail | approved |
| Shared -> Published | Client acceptance | hotmail | approved |

- Once the EIR exists, IFC files are also checked against the IDS (a machine-readable requirements file) built from it.
- **Known limit:** the project has one delivery contract (founder decision 6). The HVAC model was refused by it (37 of 37 elements are proxies, F-SNW-12). This is carried as a risk in P0-05, not hidden by weakening the contract.
