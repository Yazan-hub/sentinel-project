# P1-03 Task teams and detailed responsibility matrix (clause 5.4.2)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real appointment.

**What 5.4.2 asks (reference file, Part 2 p.50).** The lead, with the appointed parties, builds the detailed responsibility matrix from the BEP's high-level matrix. It says what information is produced, when it is exchanged, with whom, and which task team is responsible, and it refers back to the EIR. CDBB BEP 2.3 (p.6) asks for this per element, including the level of information need per milestone.

## (a) Teams to declare

Use the Declare team form. The team code is used identically in the form, the matrix columns and the MIDP team column (upper case). All five leads are the same account (roadmap call: one person plays every task team leader). The paste may create a team without a lead e-mail; fill it in, because `roles.responsibility` passes only when each declared team has a valid lead e-mail.

| Code | Name | Lead e-mail | Discipline | Appointment | Notes |
|---|---|---|---|---|---|
| ARC | Architecture and Facades | user4@gmail.com | Architecture, facades | lead | Models: Architectural and Facades. Lead appointed party's own team. Seat user3@gmail.com (contributor) also sits here. |
| STR | Structure | user4@gmail.com | Structural engineering | delivery | Model: Structural |
| MEP | Mechanical, plumbing and electrical | user4@gmail.com | Building services | delivery | One team, three models: HVAC, Plumbing, Electrical (role codes M, P, E). Models expected to be refused by the one contract (P0-05 R06). |
| SIT | Site and landscape | user4@gmail.com | Landscape | delivery | Model: Site (role code L, added by the proposed naming change in P1-02 part (e)) |
| INT | Interior | user4@gmail.com | Interior design | delivery | No container. Produces furniture and finishes inside the ARC model (decision 10). |

Which value "lead" or "delivery" in the Appointment field is right for each team is our assumption: Snowdon Office is the lead appointed party and all five teams belong to it, so "delivery" here means a task team of the delivery team (not verified against the form's wording).

## (b) Detailed responsibility matrix

Matrix block, columns ARC STR MEP SIT INT (each column names the declared team code). Marks: **P** = produces (the `produces` mark; exactly one per row), **C** = contributes (`contributes`; consulted or informed), blank = no part. The "First at" column is the milestone from which the element is delivered (the matrix `milestone` field). SYNTHETIC, agreed with the client.

| # | Element or system | ARC | STR | MEP | SIT | INT | First at |
|---|---|---|---|---|---|---|---|
| 1 | Grids and levels | P | C | C | C | | M1 |
| 2 | Architectural walls, floors, roofs | P | C | C | | | M1 |
| 3 | Facades and curtain walls | P | C | | | | M1 |
| 4 | Doors and windows | P | | | | C | M2 |
| 5 | Rooms and spaces (names, numbers) | P | | C | | C | M1 |
| 6 | Ceilings | | | C | | P | M3 |
| 7 | Furniture (345 elements, sample count) | C | | | | P | M2 |
| 8 | Finishes and coverings (68, sample count) | C | | | | P | M2 |
| 9 | Structural frame: columns, beams, foundations | C | P | C | | | M1 |
| 10 | Structural floors and cores | C | P | C | | | M1 |
| 11 | HVAC systems | C | C | P | | | M2 |
| 12 | Plumbing systems | C | C | P | | | M2 |
| 13 | Electrical systems | C | C | P | | | M2 |
| 14 | Openings in structure for services | C | C | P | | | M2 |
| 15 | Site, terrain and landscape | C | | | P | | M1 |
| 16 | Fire rating data on walls and doors | P | C | | | | M2 |
| 17 | Drawing sheets as PDF | P | C | C | C | C | M3 |
| 18 | IFC 2x3 export of the Architectural and Facades models | P | | | | C | M1 |

Notes.
- Ceilings (row 6): the matrix gives INT the production of ceilings as a finish, inside the ARC model. In the BEP LOIN grid (P1-02 part (f), row 11) the ceiling rule is owned by INT and ARC.
- The IFC export of the other models is by the owning team (STR, MEP, SIT) and is part of rows 9 to 15. Row 18 covers ARC's two models only, so that one team produces each row.
- Each row marks one producer. A check, authorization and acceptance are not matrix marks here; they are the review chain in BEP section 5.

## (c) Which container each team owns

Sentinel assigns a team to a whole container (founder decision 12; roadmap "Container names" call). Names follow `SNW_<originator>_<volume>_<level>_<type>_<role>_<number>`.

| Team | Container | Model | Notes |
|---|---|---|---|
| ARC | SNW_ARC_ZZ_XX_M3_A_0001 | Architectural | INT's furniture and finishes sit inside it |
| ARC | SNW_ARC_ZZ_XX_M3_A_0002 | Facades | Renamed from FAC: the originator is the team |
| STR | SNW_STR_ZZ_XX_M3_S_0001 | Structural | |
| MEP | SNW_MEP_ZZ_XX_M3_M_0001 | HVAC | Refused by the one contract (37 of 37 elements are proxies, F-SNW-12) |
| MEP | SNW_MEP_ZZ_XX_M3_P_0001 | Plumbing | Not run in Snowdon; expected to be refused the same way |
| MEP | SNW_MEP_ZZ_XX_M3_E_0001 | Electrical | Not run in Snowdon; expected to be refused the same way |
| SIT | SNW_SIT_ZZ_XX_M3_L_0001 | Site | Role code L needs the naming change of P1-02 part (e) |
| INT | none | none | Works inside SNW_ARC_ZZ_XX_M3_A_0001. Team-to-element responsibility is held only in this matrix; Sentinel cannot assign it (recorded finding, gap 5b). |
