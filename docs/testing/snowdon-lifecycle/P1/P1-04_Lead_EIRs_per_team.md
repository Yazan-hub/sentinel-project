# P1-04 Lead appointed party's exchange information requirements, one per appointed party (clause 5.4.3)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real appointment.

**What 5.4.3 asks (reference file, Part 2 p.51).** The lead sets one EIR for each appointment it makes. It may pass down parts of the client's EIR, around the level of information need. Later it is the mechanism used to authorize models (5.7.2). The step-by-step detail is in the clause and is not reproduced in our reference file (not verified).

**How to use.** Make one EIR document per team in Documents (the EIR template), titled "Lead EIR to <team>". Paste the text under each `##` heading below as the body. Sentinel has no link from a lead EIR to the client EIR (PARTIAL in the roadmap), so each text names the client EIR section it passes down. These documents contain no requirement sentences with "shall", so they do not change the IDS: only one EIR drives the IDS at a time, and it is the client EIR (P1-01). Do not run Compile to IDS on them.

Common to every team: issued by Snowdon Office (yazanhijazeen32@gmail.com) to the team leader (user4@gmail.com). Container names follow the client's naming rule (client EIR section 4) with the proposed changes (BEP section 6). Status codes are those of client EIR section 4. Delivery goes through the review chain: task team check (user3@gmail.com), lead authorization (yazanhijazeen32@gmail.com), client acceptance (yazanhijazeen32@hotmail.com). Milestones: M1 2026-12-04, M2 2027-01-15, M3 2027-02-26. The lead's internal due date is five working days before each milestone (SYNTHETIC) so the chain can finish.

## Lead EIR to ARC (Architecture and Facades)

Passes down: client EIR section 2 (IFC 2x3 per container; sheets as PDF at M3; all properties in the list), section 3 (level of information need), section 6 (milestones).

Containers: SNW_ARC_ZZ_XX_M3_A_0001 (Architectural, with INT's furniture and finishes) and SNW_ARC_ZZ_XX_M3_A_0002 (Facades).

- **M1:** both models as IFC 2x3. Main walls, floors, roofs, cores, grids and levels. Spaces placed and named (LongName). Walls with IsExternal. Walls with LoadBearing and Floors with IsExternal (BEP LOIN rows 2 and 3).
- **M2:** doors and windows modelled. Walls with FireRating. Doors with FireRating where known. Window and door references. Roofs with ThermalTransmittance. Windows with ThermalTransmittance.
- **M3:** FireRating on all walls, doors, windows and stairs. All spaces named. Drawing sheets as PDF, named by the container rule with type DR (if accepted by the client).
- Also needed from ARC: the IFC export of each model, and the coordination issues assigned to ARC.

## Lead EIR to STR (Structure)

Passes down: client EIR section 2 (Pset_ColumnCommon.LoadBearing on every column), section 3 and section 6.

Container: SNW_STR_ZZ_XX_M3_S_0001.

- **M1:** IFC 2x3. Structural frame, floors and cores at concept level. Columns with LoadBearing.
- **M2:** beams with LoadBearing. Openings for services agreed with MEP.
- **M3:** coordinated structural model for construction documents. No open unassigned clash group between STR and ARC.
- STR is one of the two models re-published at M2 and M3 (roadmap: only ARC and STR are re-published for design and coordination).

## Lead EIR to MEP (Mechanical, plumbing and electrical)

Passes down: client EIR section 2 (IFC 2x3 per container), section 3 (main MEP routes at M2) and section 6.

Containers: SNW_MEP_ZZ_XX_M3_M_0001 (HVAC), SNW_MEP_ZZ_XX_M3_P_0001 (Plumbing), SNW_MEP_ZZ_XX_M3_E_0001 (Electrical).

- **M1:** each model as IFC 2x3, at concept level (main equipment locations).
- **M2:** main routes modelled. Openings in structure requested from STR.
- **M3:** coordinated models for construction documents.
- **Known limit, stated now:** the project's one delivery contract refused the HVAC model (37 of 37 elements are proxies, F-SNW-12). These three models are expected to be refused at the gate. Their MIDP rows stay pending as evidence (P1-05). MEP still owes the information.

## Lead EIR to SIT (Site and landscape)

Passes down: client EIR section 2, section 3 (grids and levels, site at M1) and section 6.

Container: SNW_SIT_ZZ_XX_M3_L_0001. The role code L needs the naming change in BEP section 6.

- **M1:** IFC 2x3. Terrain and main site elements.
- **M2:** landscape elements added.
- **M3:** coordinated with the Architectural model at the building edge.
- For design and coordination only ARC and STR are re-published by default, so the SIT rows at M2 and M3 are expected to stay pending unless the Site model is republished (P1-05).

## Lead EIR to INT (Interior)

Passes down: client EIR section 3 (furniture placed at M2; spaces named; ceilings and finishes at M3) and section 6.

Container: none. INT works inside SNW_ARC_ZZ_XX_M3_A_0001 and hands the information to ARC; ARC publishes it.

- **M1:** none due. INT confirms the room list with ARC.
- **M2:** furniture placed (sample: 345 elements) with a reference (BEP LOIN row 8; the set name is not verified). Finishes and coverings placed (sample: 68).
- **M3:** ceilings with FireRating (BEP LOIN row 11). Finishes coordinated with room data.
- INT's share is not a separate container, so no MIDP row names INT; the TIDP records it (P1-06).
