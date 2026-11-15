# P1-06 Task information delivery plans, one per team (clause 5.4.4)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real appointment.

**What 5.4.4 asks (reference file, Part 2 p.52).** The appointed party or task team writes its TIDP. There is no prescribed format. The minimum contents are in clause 5.4.4 paragraph 3, which our reference file does not reproduce (not verified). The plan is given per information container and covers what is delivered and the possibly repeated "whens".

**How to use.** Make one TIDP document per team in Documents (the TIDP template, `WebApp/bridge/templates/tidp-template.json`, 7 sections). Paste each `###` text into the section of the same number and title. The measured plan is the MIDP (P1-05); these documents stay short and point to it. Every container, date, revision and team below matches the 21 MIDP rows. Authorship: the TIDP is the task team's, so it is written by user4@gmail.com (task team leader); the lead reviews it.

Common facts. Checker: user3@gmail.com. Authorizer: yazanhijazeen32@gmail.com. Client acceptance: yazanhijazeen32@hotmail.com. Milestones: M1 2026-12-04, M2 2027-01-15, M3 2027-02-26. Software: Revit 2025.4, IFC 2x3 export, Sentinel add-in (BEP section 9).

## TIDP ARC (Architecture and Facades)

### 1. Task team and appointment
Task team ARC, lead user4@gmail.com. Appointment: Snowdon Office's own team under the client appointment (P1-07 part 1) and the team letter (P1-07 part 2). Answers BEP section 2 and the lead EIR to ARC (P1-04). Reports to yazanhijazeen32@gmail.com.

### 2. Deliverables
SNW_ARC_ZZ_XX_M3_A_0001 Architectural model: purpose, the building's walls, floors, roofs, doors, windows, rooms, with INT's furniture and finishes inside. LOIN as BEP section 7 rows 1 to 6, 9 to 12. Author user4@gmail.com, checker user3@gmail.com.
SNW_ARC_ZZ_XX_M3_A_0002 Facades model: purpose, facade design. Same author and checker.

### 3. Milestones and dates
Both containers: v1 at M1 2026-12-04, v2 at M2 2027-01-15, v3 at M3 2027-02-26 (MIDP rows 1, 2, 8, 9, 15, 16). Stage design for M1 and M2, coord for M3. Sheets as PDF at M3.

### 4. Dependencies and predecessors
Needs from STR: structural grid and floors before M1. Needs from MEP: openings requests before M2. Needs from INT: furniture and finishes inside the model before M2. Needs from the client: acceptance of the naming change (BEP section 6) before M1.

### 5. Review and authorisation
Governed Publish in Revit by user4@gmail.com, then Share, then the review chain: task team check (user3), lead authorization (gmail), client acceptance (hotmail). A rejection returns the version to Work in progress.

### 6. Resources and capability
user4@gmail.com and user3@gmail.com (SYNTHETIC persons), one workstation. The capability sheet is P0-03. Gap: no spare workstation (P0-05 R03).

### 7. Change
A change to a date or a deliverable is agreed with the lead and shown in the MIDP; the lead approves; the client is told if a milestone date moves.

## TIDP STR (Structure)

### 1. Task team and appointment
Task team STR, lead user4@gmail.com. Appointment: delivery team member under the lead; lead EIR to STR (P1-04).

### 2. Deliverables
SNW_STR_ZZ_XX_M3_S_0001 Structural model: purpose, the structural frame, floors and cores. LOIN as BEP section 7 rows 2, 7. Author user4@gmail.com, checker user3@gmail.com.

### 3. Milestones and dates
v1 at M1 2026-12-04, v2 at M2 2027-01-15, v3 at M3 2027-02-26 (MIDP rows 3, 10, 17). STR is re-published at M2 and M3.

### 4. Dependencies and predecessors
Needs from ARC: grids and levels before M1. Needs from MEP: services openings before M2.

### 5. Review and authorisation
As ARC.

### 6. Resources and capability
As ARC. Capability sheet P0-03.

### 7. Change
As ARC.

## TIDP MEP (Mechanical, plumbing and electrical)

### 1. Task team and appointment
Task team MEP, lead user4@gmail.com. Appointment: delivery team member; lead EIR to MEP (P1-04).

### 2. Deliverables
SNW_MEP_ZZ_XX_M3_M_0001 HVAC, SNW_MEP_ZZ_XX_M3_P_0001 Plumbing, SNW_MEP_ZZ_XX_M3_E_0001 Electrical. Purpose: building services models. Author user4@gmail.com, checker user3@gmail.com.

### 3. Milestones and dates
Each of the three: v1 at M1 2026-12-04, v2 at M2 2027-01-15, v3 at M3 2027-02-26 (MIDP rows 4 to 6, 11 to 13, 18 to 20). All nine rows are expected to stay pending: the one delivery contract refuses these models (P0-05 R06, F-SNW-12).

### 4. Dependencies and predecessors
Needs from STR: structural layout before M2. Needs from ARC: room layout before M1.

### 5. Review and authorisation
As ARC, if a model passes the gate. A refused model does not enter the chain; the refusal is recorded.

### 6. Resources and capability
As ARC. Gap: the models fail the contract. Closed by a per-discipline contract in Sentinel, which does not exist yet (recorded finding).

### 7. Change
As ARC.

## TIDP SIT (Site and landscape)

### 1. Task team and appointment
Task team SIT, lead user4@gmail.com. Appointment: delivery team member; lead EIR to SIT (P1-04).

### 2. Deliverables
SNW_SIT_ZZ_XX_M3_L_0001 Site model: purpose, terrain and landscape. Author user4@gmail.com, checker user3@gmail.com.

### 3. Milestones and dates
v1 at M1 2026-12-04, v2 at M2 2027-01-15, v3 at M3 2027-02-26 (MIDP rows 7, 14, 21). M2 and M3 rows are expected pending unless the Site model is re-published.

### 4. Dependencies and predecessors
Needs from ARC: building footprint before M1. Needs from the client: acceptance of role code L (BEP section 6).

### 5. Review and authorisation
As ARC.

### 6. Resources and capability
As ARC.

### 7. Change
As ARC.

## TIDP INT (Interior)

### 1. Task team and appointment
Task team INT, lead user4@gmail.com. Appointment: delivery team member; lead EIR to INT (P1-04). INT owns no container.

### 2. Deliverables
No container of its own. Furniture (sample 345 elements) and finishes and coverings (sample 68) inside SNW_ARC_ZZ_XX_M3_A_0001, plus ceilings. LOIN as BEP section 7 rows 8 and 11. Author user4@gmail.com, checker user3@gmail.com.

### 3. Milestones and dates
Furniture and finishes at M2 2027-01-15; ceilings at M3 2027-02-26. They arrive in the ARC container (MIDP row 8 for M2, row 15 for M3). No MIDP row names INT.

### 4. Dependencies and predecessors
Needs from ARC: rooms and spaces named before M2.

### 5. Review and authorisation
Through the ARC container's chain. Sentinel cannot show INT's share separately (decision 10).

### 6. Resources and capability
As ARC. Gap: Sentinel assigns a team to a whole container, not to elements inside it.

### 7. Change
As ARC. A change to INT's scope is a change to the ARC TIDP and the matrix in P1-03.
