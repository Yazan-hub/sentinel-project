# P1-01 Exchange information requirements (EIR): Snowdon Towers (SNW), drafted by the lead with the client

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real appointment.

**How to use this file.** Each `##` heading below is one section of the Sentinel EIR template (`WebApp/bridge/templates/eir-template.json`), with the same number and title. Paste the text under each heading into that section. Do not paste this introduction, the line above, or the two tables after section 7.

**Who does what in Sentinel (decision 5).** The Lead firm account (yazanhijazeen32@gmail.com) writes this EIR from the anticipated requirements in P0-02 section 3 and issues it (Lead firm step). The Client account (yazanhijazeen32@hotmail.com) accepts it (Client step). The BEP is confirmed only after that. The ISO clause behind this document is 5.2.1 (the client's EIR); in this exercise the lead drafts it with the client because the client has none (Part E p.24). The seven headings are Sentinel's own, not a list from clause 5.2.1 (the clause text is not reproduced in our reference file).

Every sentence that uses the word "shall" is a requirement sentence for the compiler (Documents, Compile to IDS). Other sentences are written without that word on purpose, so the compiler reads only what is meant as a check.

---

## 1. Organizational and project context

- **Project:** Snowdon Towers, project code SNW. A mixed-use tower. SYNTHETIC client, programme and appointment; the design is Autodesk's Snowdon Towers sample.
- **Appointing party (client):** Snowdon Developments (sample), account yazanhijazeen32@hotmail.com. SYNTHETIC.
- **Lead appointed party:** Snowdon Office (office key `snowdon-office`), information management by yazanhijazeen32@gmail.com. SYNTHETIC.
- **Why the client needs the information (SYNTHETIC).** The client uses the models at each milestone to check design progress, to agree the design with its funder, and to prepare construction tender information. After construction the client wants a room and door data set for operation.
- **Organizational and project information requirements.** The client has no written OIR or PIR (SYNTHETIC; not verified for a real client). This EIR therefore states the information needs directly. The need behind each requirement is in the "why" column in section 3.
- **Status of this document.** Drafted by the lead and agreed with the client under project code SNW. This EIR replaces the anticipated requirements in the tender BEP (P0-02 section 3). The project follows ISO 19650 from the acceptance of this EIR.

## 2. Information requirements

The appointed party delivers, at each information delivery milestone in section 6:

1. One IFC 2x3 file for each information model container named in the BEP, one file per container.
2. The native Revit file for each container, held in the project CDE and not issued to the client.
3. At M3 only: the drawing sheets of the Architectural model as PDF files, each named by the container rule in section 4.
4. The BEP, the MIDP and the list of open coordination issues, each in the CDE.

The client requires these properties in the IFC files. Each line is one requirement and is checked against the IFC file:

- Every wall shall have Pset_WallCommon.FireRating.
- Every wall shall have Pset_WallCommon.IsExternal.
- Every door shall have Pset_DoorCommon.FireRating.
- Every door shall have Pset_DoorCommon.IsExternal.
- Every window shall have Pset_WindowCommon.ThermalTransmittance.
- Every column shall have Pset_ColumnCommon.LoadBearing.
- Every space shall have a LongName.

Other client needs, written the way a client would write them (the compiler is expected to refuse these two, and to say why):

- The appointed party shall deliver all information on time.
- Every wall shall be of good quality.

The level of information need per element and milestone is in section 3.

## 3. Level of information need

The client needs more information at each milestone. Geometry and information are listed together. SYNTHETIC, agreed with the client.

| Milestone | Geometry needed | Information needed | Why the client needs it |
|---|---|---|---|
| M1 Concept/Schematic Design, 2026-12-04 | Main walls, floors, roofs, cores, grids and levels. Spaces placed. | Space names. Walls with IsExternal. | To agree the building envelope and the room list with its funder |
| M2 Design Development, 2027-01-15 | Doors, windows, structure and main MEP routes modelled. Furniture placed. | Walls with FireRating and IsExternal. Doors with FireRating where known. | To check the fire strategy and to prepare the cost plan |
| M3 Construction Documents, 2027-02-26 | Coordinated models for construction documents. | FireRating on all walls and all doors. All spaces named. Sheets as PDF. | To issue construction tender information |

The delivery team shows how it meets this table in its BEP, section 7 (a table of elements, milestones and properties).

## 4. Standards and methods

- **Information standard.** ISO 19650-2 applies from the acceptance of this EIR. The client's classification system: none stated (SYNTHETIC; the lead may propose one in the BEP).
- **Formats.** IFC 2x3 for exchange. PDF for sheets. BCF 2.1 or 3.0 for coordination issues.
- **Units and coordinates.** Metres for length. The shared coordinates carried by the sample models stay as they are; the lead confirms them at mobilisation (P0-04).
- **Container naming (the client's rule).** Seven fields in this order, separated by an underscore: `SNW_<originator>_<volume>_<level>_<type>_<role>_<number>`.

| Field | Values the client allows (SYNTHETIC) |
|---|---|
| Project | SNW |
| Originator | ARC, STR, MEP, SIT (the task team code) |
| Volume | ZZ (whole building) |
| Level | XX (more than one level) |
| Type | M3 (3D model) |
| Role | A architect, S structural, M mechanical, P plumbing, E electrical |
| Number | four digits, from 0001 |

The meanings of these codes are our proposal and are not checked against the UK National Annex (the annex was not read).

- **Status codes (the UK 2021 National Annex, founder decision 8; wording to be checked against the annex before any contract).**

| Code | State | Meaning |
|---|---|---|
| S0 | Work in progress | Work in progress |
| S1, S2, S3 | Shared | Shared for coordination, for information, or for review and comment |
| S4 | Shared | Submitted for lead authorization (5.7.1) |
| S5 | Shared | Submitted for client review and acceptance (5.7.3) |
| A1, A2, A3 | Published | Accepted at M1, at M2 and at M3 (SYNTHETIC purposes) |

S6, S7 and CR are not used. The purpose of each A code belongs in the information standard.

- **Production methods.** The delivery team follows its BEP. The client asks for a three-step check before information reaches the client: task team check, lead authorization, client acceptance.

## 5. CDE requirements

- **Which CDE.** Sentinel, provided by the lead. The client has an account in it (a viewer in the Client party, who accepts).
- **States.** Work in progress, Shared, Published, Archived. A container version carries its state and status code. The folder tree is separate from state.
- **Who moves information.** The task team leader shares. The task team checker checks. The lead authorizes. The client accepts, and acceptance publishes.
- **Security.** Only project members have access. The ledger records every state change with the person who made it.
- **Known limit, stated now.** In Sentinel a container is already Shared, and readable by all project members, before the task team check. Acceptance publishes without changing the status code, so an A code needs a new version (founder decisions 3 and 9).

## 6. Delivery milestones

All dates are SYNTHETIC. The mobilisation of the delivery team runs from 2026-11-16 to 2026-11-25.

| Milestone | Date | What is Published at the milestone |
|---|---|---|
| M1 Concept/Schematic Design | 2026-12-04 | The seven information model containers as IFC 2x3, with the M1 information of section 3 |
| M2 Design Development | 2027-01-15 | The same containers with the M2 information of section 3 |
| M3 Construction Documents | 2027-02-26 | The same containers with the M3 information, and the sheets as PDF |

The client accepts or rejects each milestone within five working days of the lead's authorization (SYNTHETIC).

## 7. Acceptance criteria

The client accepts a container when all of these hold. The lead checks them before authorizing.

- The container name follows section 4 and the status code is one of section 4.
- The IFC file passes the checks compiled from section 2, with no failed requirement. The delivery team may keep a short list of agreed exceptions, each with a reason.
- Each milestone delivers the information of section 3 for that milestone.
- The task team check and the lead authorization are recorded before the client accepts.
- The client rejects with a written reason. A rejected container goes back to Work in progress and a coordination issue is raised.
- The delivery team answers a rejection within five working days (SYNTHETIC).

---

## Sentences the compiler should read

Documents, Compile to IDS. Expected IDS requirement: class, property set, property, cardinality required, no value. The class and property come from the vocabularies in `WebApp/bridge/ids-compile.mjs` (ENTITY_VOCAB line 17, PROPERTY_VOCAB line 33; an explicit `Pset_X.Name` is read by `findPset`, line 133).

| # | Sentence (section 2) | Expected IDS requirement |
|---|---|---|
| 1 | Every wall shall have Pset_WallCommon.FireRating. | IFCWALL, Pset_WallCommon, FireRating, required |
| 2 | Every wall shall have Pset_WallCommon.IsExternal. | IFCWALL, Pset_WallCommon, IsExternal, required |
| 3 | Every door shall have Pset_DoorCommon.FireRating. | IFCDOOR, Pset_DoorCommon, FireRating, required |
| 4 | Every door shall have Pset_DoorCommon.IsExternal. | IFCDOOR, Pset_DoorCommon, IsExternal, required |
| 5 | Every window shall have Pset_WindowCommon.ThermalTransmittance. | IFCWINDOW, Pset_WindowCommon, ThermalTransmittance, required |
| 6 | Every column shall have Pset_ColumnCommon.LoadBearing. | IFCCOLUMN, Pset_ColumnCommon, LoadBearing, required |
| 7 | Every space shall have a LongName. | IFCSPACE, property LongName, required. LongName is an IFC attribute, not a property in a set, and no standard set holds it (STANDARD_PSETS has no LongName), so the property set is expected to be empty. Not verified how the install or the judge treats that. A deliberate test row. |

Expected headline: 9 requirement sentences read, 7 compiled, 2 unmatched.

## Sentences it should refuse

These two are in section 2 on purpose. They use "shall" but are outside the grammar. The compiler should return each in `unmatched` with its reason (the reason strings are in `compileIds`, lines 178-182).

| Sentence | Expected reason |
|---|---|
| The appointed party shall deliver all information on time. | No IFC entity and no property could be identified. |
| Every wall shall be of good quality. | No property could be identified; name the property, or write it as Pset_Name.PropertyName. |
