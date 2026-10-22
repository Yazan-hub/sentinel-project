# ISO 19650-2:2018 - what each stage requires: who, inputs, outputs

Sources (page numbers = PRINTED page numbers in each document, not PDF indices):
- **Part E** = UK BIM Framework, ISO 19650 Guidance Part E "Tendering and appointments", Edition 2, Feb 2021.
- **Part 2** = UK BIM Framework, ISO 19650 Guidance Part 2 "Parties, teams and processes for the delivery phase", Edition 6, Feb 2021.
- **CDBB BEP** = BIM Toolkit "Pre-appointment and Delivery Team's BEP - Guidance" (template guidance; its own page numbers).

All three are GUIDANCE, not the standard. Quoted lists are as the guidance gives them; "guidance paraphrase" marks
paraphrase of the clause. The PDFs do NOT reproduce ISO 19650-2 clause text, so where the guidance only says
"see clause 5.x" the file says "not reproduced". Nothing is added beyond the sources.

Scope (Part 2 p.13): 5.1 and 5.8 are per PROJECT; 5.2-5.7 repeat per lead-appointed-party APPOINTMENT.
Involvement by role (Part 2 Tables 4, 7, 9, pp.16, 22, 27; PDF text layer is column-mangled, read in row order):

| Stage | Appointing party | Lead appointed party | Appointed party / task team |
|---|---|---|---|
| 5.1 Assessment and need | High | Nil | Nil |
| 5.2 Invitation to tender | High | Nil | Nil |
| 5.3 Tender response | Low | High | Medium |
| 5.4 Appointment | Medium | High | Medium |
| 5.5 Mobilization | Low | High | Medium |
| 5.6 Collaborative production | Low | High | High |
| 5.7 Information model delivery | Medium | High | High |
| 5.8 Project close-out | High | Medium | Nil |

---
## 5.1 Assessment and need (PROJECT; appointing party only; before the first lead appointed party is tendered)
Part 2 pp.29-36; primary party = appointing party, no contributing parties for any 5.1 sub-clause.

- **5.1.1 Appoint individuals to undertake the information management function** (p.29). Input: scope of the function;
  ISO 19650-2 Annex A "Information Management Assignment Matrix". Output: individuals (in-house/third party) named,
  matrix completed, any third-party/lead appointment reflects allocated activities. Guidance: those doing this for
  the client should not also do the lead appointed party's own function.
- **5.1.2 Establish the project's information requirements** (p.30). Output: PIR (not expressed in tender or
  appointment content). Seven points the clause says to consider: 1 the project scope; 2 the intended purpose for
  which the information will be used by the appointing party; 3 the project plan of work; 4 the intended procurement
  route; 5 the number of key decision points throughout the project; 6 the decisions the appointing party needs to
  make at each key decision point; 7 the questions to which the appointing party needs answers, to make informed
  decisions. Irrelevant points only need to be "considered" and documented.
- **5.1.3 Establish the project's information delivery milestones** (p.31). Four considerations (not listed in
  guidance). Milestones support key decision points; unlikely to be date-specific yet. Output: delivery milestones.
- **5.1.4 Establish the project's information standard** (p.32; Part E pp.19-21). Considers: exchange of information;
  structuring and classification; method of specifying level of information need; use during the operational phase.
  Part E p.21 content examples: container unique-ID convention (project identifier, originator codes), status and
  revision codes, level-of-information-need framework, classification system(s), internal/external space
  designation. Part E p.20: no set structure; clause-based minimum; PD ISO/TS 12911 structure; title block per
  BS EN ISO 7200 (Title, Author, Approver). Output: information standard.
- **5.1.5 Establish the project's information production methods and procedures** (p.33). Considers: capture of
  existing asset information; generation, review or approval of new information; security or distribution; delivery
  to the appointing party. Part E p.22: guidance on this "in development". Output: production methods and procedures.
- **5.1.6 Establish the project's reference information and shared resources** (p.34). Reference information e.g. OS
  mapping, adjacent assets/utilities, extracts of the existing asset model, output of a preceding appointment. Shared
  resources e.g. document templates, 3D object libraries, custom line styles, a BEP template (clause 5.1.6 a), Part E
  p.24). Output: reference information and shared resources.
- **5.1.7 Establish the project's common data environment** (p.35). Appointing party accountable; may delegate hosting;
  must exist before tender information is issued; may transition to the lead appointed party after appointment.
  Must enable (guidance paraphrase): unique container ID from a documented delimiter-separated convention; each
  field from a documented codification; attributes status, revision, classification; state transitions with user and
  date recorded; container-level access control. Output: configured CDE.
- **5.1.8 Establish the project's information protocol** (p.36; Part E pp.9-18, Table 2 p.10). Every appointment must
  contain one; the lead's contains the project protocol, passed down with appropriate differences. Part E p.12: UK BIM
  Framework Information Protocol Template, Activities 1-5 (download; populate with project info + EIR; include in each
  tender package; populate appointment-specific info; complete incorporation clause). Output: information protocol.

---
## 5.2 Invitation to tender (APPOINTMENT; appointing party only)
- **5.2.1 Establish the appointing party's EIR** (Part 2 p.37). Inputs: PIR (incl. OIR), AIR, delivery milestones,
  information standard, production methods and procedures, reference information. Each EIR is appointment-specific,
  broken down to the lead's scope, each requirement tied to a level of information need, exchange dates relative to
  milestones; it is later the mechanism for accepting models (5.7.4). Output: the EIR. Part E p.24: if the client
  issues no EIR the bidder should anticipate it in the BEP and flag that the project is not following ISO 19650.
- **5.2.2 Assemble reference information and shared resources** (p.38). Input: 5.1.6. Output: containers in the CDE with
  status, revision and classification codes; bidder access managed (no sight of other teams' information) and revoked
  for unsuccessful bidders.
- **5.2.3 Establish tender response requirements and evaluation criteria** (p.39). Minimum requirements the bidder must
  address (may be questions) and how they are evaluated (measurable, appointment-specific). Key considerations
  "likely to be": required content of the (pre-appointment) BEP; competency, capability and capacity of the
  prospective lead appointed party; how the delivery team will be mobilized (and that delivery will not begin until the
  plan is enacted); the bidder's information delivery risk via a risk register. Output: requirements + criteria.
- **5.2.4 Compile invitation to tender information** (p.40; list p.14). Combined with other tender information. Per
  Part 2 p.14 the package "should consider, and where appropriate include": EIR; existing information and resources
  relevant to the tender; details of how the tender will be evaluated; overall project requirements for information
  delivery, standards and processes; the project's information protocol (Part E p.10: 5.2.4). Output: ITT information.

---
## 5.3 Tender response (APPOINTMENT; prospective lead appointed party; task teams contribute)
BEP, capability/capacity, mobilization plan and risk register are "separate resources"; presentation is the bidder's
choice unless the client instructs (Part E p.23). Prepared with prospective delivery-team members (Part 2 p.18).

- **5.3.1 Nominate individuals to undertake the information management function** (Part 2 p.41). Who: prospective lead.
  Appointment-level equivalent of 5.1.1; may split into tasks, may appoint another organization; avoid conflict of
  interest if the same party also serves the client's function. Typo note: paragraph 3 should say lead appointed
  party. Output: named individuals. CDBB BEP Table 1.1 (p.3) lists functions: nominate individuals; establish
  (pre-appointment) BEP; assess task team capability and capacity; establish delivery team capability and capacity;
  establish mobilization plan; establish risk register; compile tender response (Name / Task team / Email).
- **5.3.2 Establish the delivery team's (pre-appointment) BEP** (Part 2 p.42; Part E pp.23-26). Who: prospective lead,
  with known prospective appointed parties. Inputs: client BEP template or contents list, EIR, information standard,
  production methods and procedures. Output: (pre-appointment) BEP. Clause "shall consider" seven items (Part E
  pp.25-26): A) details of individuals undertaking the information management function; B) proposed information
  delivery strategy, which 5.3.2 b) says contains the approach to meeting the EIR, objectives and goals for
  collaborative production of information, organizational structure and commercial relationships of the delivery
  team, the split of the delivery team into task teams; C) the proposed federation strategy; D) the delivery team's
  high-level responsibility matrix; E) proposed additions/amendments to the information production methods and
  procedures (if any); F) proposed additions/amendments to the information standard (if any); G) proposed schedule of
  software, hardware and IT infrastructure. Part E p.24 scenarios: (1) client template, (2) client contents list only,
  (3) client silent. Part E p.23: one BEP per delivery team, two early versions (pre-appointment, then updated).
  CDBB BEP template sections: 1 Introduction (1.1 project description, 1.2 scope and collaboration goals, 1.3
  information management responsibilities); 2 Information delivery strategy (2.1 objectives/goals, 2.2 organisational
  structure and composition, 2.3 detailed responsibility matrix, 2.4 schedule of software, 2.5 federation strategy,
  2.6 information delivery plans, 2.7 information delivery risk register, 2.8 mobilisation plan, 2.9 PIM delivery
  strategy, 2.10 AIM/handover); 3 adjustments/additions to information standard and production methods
  (pre-appointment only; state "no changes" if none, CDBB BEP p.12); 4 Appendix (4.1 responsibility matrix, 4.2 MIDP,
  4.3 mobilisation checklist) (CDBB BEP contents, p.22).
- **5.3.3 Assess task team capability and capacity** (Part 2 p.43). Who: each prospective task team/appointed party.
  Three aspects (also p.24): capability and capacity to manage information; to produce information; availability of IT
  (hardware, software, support, quantities). Evidence should be available; third-party certification possible.
- **5.3.4 Establish the delivery team's capability and capacity** (p.44). Who: prospective lead; task teams contribute.
  Guidance: "no Insight for this clause"; content list not reproduced. Output: capability and capacity summary (p.18).
- **5.3.5 Establish the delivery team's mobilization plan** (p.45). Informs the client; planning tool for the lead. Form
  free (schedule, table, Gantt). Clause makes the lead consider "11 elements covering testing of information exchange
  and delivery, common data environments, other software and hardware requirements and training and education" (the 11
  are not enumerated). Plan "may include": consistent export formats; testing the delivery team's and project CDE and
  access, incl. acceptance workflows; testing container exchange between solutions; site-office ICT; CDE guides;
  educating/training on project goals and mandatory client solutions; recruiting information-management roles;
  supporting joiners. CDBB BEP checklist 4.3 (pp.22-24): A1 DTCCA done; B1-B17 CDE (configure, training, upload tests,
  automated workflows, distribution, authorisation notification, metadata, information manager and appointing-party
  authorisation, state transfer, security/access, archiving, correspondence, RFI, review/shared-state comments,
  download/watermarks); C1-C6 IT; D1-D6 standards and methods; E1-E4 capacity; F1-F3 kick-off, training.
- **5.3.6 Establish the delivery team's risk register** (pp.46-47). Who: prospective lead; task teams contribute. One
  integrated register ("the BEP should not feature a supplementary risk register"); client may ask for a subset
  (e.g. red risks). Suggested headings: Assumptions (EIR gaps/adequacy, roles); Milestones (capability vs milestones,
  procurement lead times); Information protocol (acceptability, gaps vs 5.1.8); Information delivery strategy (CDE
  adequacy, documents agreed, level of information need defined, federation strategy, tested templates); Methods,
  procedures and information standards (feasibility, deviations, change handling, measurable compliance);
  Mobilization, capability and capacity (lead times for CDE, internet, configuration, training, CDE testing).
- **5.3.7 Compile the delivery team's tender response** (p.48). Who: prospective lead. No Insight. Inputs: 5.3.2,
  5.3.4, 5.3.5, 5.3.6 outputs. Output: tender response. Part E p.21: bidder may propose amendments/additions to the
  information standard; amendments should be raised as a contract negotiation visible to all bidders.

---
## 5.4 Appointment (APPOINTMENT; between selection and signing)
Part E p.28: review and confirm the BEP "between your appointment being indicated by the appointing party and the
contract being signed". Documents (Part 2 Tables 3/5/6/8, pp.15, 19, 20, 25):
- Lead appointed party's appointment: information standard, production methods and procedures, information protocol
  (appointing party prepares); EIR (appointing party); BEP and MIDP (lead). "Preparation includes delegation."
- Appointed party's appointment (Table 6): information standard, production methods and procedures, information
  protocol; delivery team BEP; lead's EIR; TIDP (appointed party/task team prepares).

- **5.4.1 Confirm the delivery team's BEP** (Part 2 p.49; Part E p.27). Who: lead; appointing party and appointed
  parties contribute. "Shall" (vs "consider" at 5.3.2); "as required" = re-check the pre-appointment BEP and update.
  Clause list not reproduced; Part E p.27 says update to confirm: responsibility and names for the information
  management function; schedule of software, hardware, IT; information delivery strategy (as required); high-level
  responsibility matrix (as required). Agreed changes to the information standard are reflected in that project-wide
  resource; federation strategy aligned to support the detailed responsibility matrix and MIDP. Confirmed between
  appointing party and lead (5.4.6) and lead and each appointed party (5.4.7). BEP is a contract document under formal
  change control. CDBB BEP p.1: agreed standard/method changes stay separate from the BEP but form part of the appointment.
- **5.4.2 Establish the delivery team's detailed responsibility matrix** (Part 2 p.50). Who: lead; appointed parties
  contribute. Input: high-level matrix from the BEP. Output: what information is to be produced, when exchanged and
  with whom, which task team is responsible; refers back to the EIR (CDBB BEP 2.3, p.6: per element, incl. LOIN per milestone).
- **5.4.3 Establish the lead appointed party's EIR** (p.51). Who: lead. One EIR per appointment it makes, may cascade
  parts of the appointing party's EIR, around level of information need; later the mechanism to authorize models
  (5.7.2). "Step by step detail" is in the clause, not reproduced. Output: lead EIR per appointed party.
- **5.4.4 Establish the TIDP(s)** (p.52). Who: appointed party/task team. No prescribed format; minimum contents in
  5.4.4 paragraph 3 (not reproduced), given per information container; covers what and the potentially repeated "whens".
- **5.4.5 Establish the MIDP** (p.53). Who: lead; appointed parties contribute. Collation of all TIDPs; ISO 19650-2 gives
  no minimum contents; TIDP contents are a starting point plus the task team per container (suggestion). Kept current as
  TIDPs change and teams join. CDBB BEP 2.6 (p.9) per deliverable: information container identification, description,
  level of definition, level of information, dependant, classifications, date of issue.
- **5.4.6 Complete lead appointed party's appointment documents** (p.54). Who: appointing party; lead contributes. All
  five resources included; brief lawyers that content may evolve (Part E p.10: protocol included here).
- **5.4.7 Complete appointed party's appointment documents** (p.55). Who: lead; appointed party contributes. Same five
  resources; protocol usually the lead's with relevant changes. Part E p.14: protocol effective only via an "incorporation
  clause" and completed Information Particulars (suggested clause text there); it should take priority.
Output of 5.4: executed appointments (Part 2 p.95).

---
## 5.5 Mobilization (APPOINTMENT; before any task team generates information)
Follow the mobilization plan from the tender (Part 2 pp.56, 58, 60); record risks in the delivery team's risk register.
- **5.5.1 Mobilize resources** (pp.56-57). Who: lead; task teams contribute. Three activities (paraphrase): confirm
  resource availability of each task team (people named in TIDP, incl. CDE admin; replacements equal or better);
  develop and deliver education; develop and deliver training. Repeat when people join. Inputs: mobilization plan,
  TIDPs, 5.3.4. Output: sufficient knowledgeable, competent individuals.
- **5.5.2 Mobilize information technology** (pp.58-59). Who: lead; appointing party and task teams contribute. Five
  activities: procure, implement, configure and test software, hardware, IT infrastructure; configure and test the
  project CDE (client enables, lead must test it supports sharing/publishing); configure and test the delivery team's
  own CDE incl. connectivity to the project CDE; test information exchanges between task teams; test information
  delivery (needs client cooperation). Output: assurance IT supports generation and management of information.
- **5.5.3 Test the project's information production methods and procedures** (p.60). Who: lead, collaboratively with
  all task teams. Review and test (e.g. federation strategy, container breakdown structure, container visibility vs
  security), refine, develop shared resources if needed, cascade to every task team.

---
## 5.6 Collaborative production of information (APPOINTMENT; iterative)
CDE states: the guidance does not list them; it names "work in progress and shared information" (Part 2 p.97),
Published after acceptance (pp.66-69), archive (p.70), and defers state transitions to ISO 19650 Guidance C.
- **5.6.1 Check availability of reference information and shared resources** (p.61). Who: each task team, before
  generating. Compare CDE content with needs; report shortfall (never shared, rights lapsed, obsolete, new needs) to
  the lead ASAP and assess TIDP impact.
- **5.6.2 Generate information** (p.62). Who: task team. Inputs: TIDP, production methods and procedures, information
  standard, level of information need. Clause 5.6.2 (b) states information that should NOT be generated (beyond level of
  need, duplicating another team, e.g. reference structural containers). Coordinate via CDE (example fortnightly);
  escalate to the lead.
- **5.6.3 Undertake quality assurance check** (p.63). Who: task team. Check the container "from the outside" per
  production methods and procedures; information standard sets unique ID, status, revision, classification. Success =
  mark as checked; failure = reject and advise the author. Can be partly automated in the CDE.
- **5.6.4 Review information and approve for sharing** (p.64). Who: task team. Check contents against the lead's EIR
  and the TIDP. Success = approve and assign a suitable status code (NA.4.2); failure = reject, record why and amendments.
- **5.6.5 Information model review** (p.65). Who: whole delivery team (lead + appointed parties). Considers EIR,
  acceptance criteria, MIDP; repeated until ready for lead authorization; containers not aligned with the MIDP
  indicate failed change control. Containers selected via status code.
Check/review/approve/authorize/accept: check = 5.6.3; review and approve = 5.6.4; authorize = lead at 5.7.2; accept =
appointing party at 5.7.4 (Part E p.19; Part 2 pp.21, 26).

---
## 5.7 Information model delivery (APPOINTMENT; each information delivery milestone)
Flow (Part 2 pp.66-69, 98): 5.7.1 submit for lead authorization; 5.7.2 lead reviews and authorizes; 5.7.3 submit for
appointing party acceptance; 5.7.4 appointing party reviews and accepts. Rejection returns to 5.6.1.
- **5.7.1 Submit information model for lead authorization** (p.66). Who: task teams, per production methods. Part 2 p.66
  assigns S6 or S7 (2018 National Annex wording); the 2021 NA (p.84) removes S6/S7 and aligns S4 with 5.7.1.
- **5.7.2 Review and authorize the information model** (p.67). Who: lead. Checks it addresses the EIR (client's and
  lead's) incl. acceptance criteria; contains all MIDP deliverables; meets client acceptance criteria; meets level of
  information need. Authorized triggers 5.7.3; rejected = task teams amend and resubmit. Avoid partial acceptance. An
  exchange only within the delivery team ends here (no 5.7.3/5.7.4).
- **5.7.3 Submit information model for appointing party acceptance** (p.68). Who: task teams through the project CDE.
- **5.7.4 Review and accept the information model** (p.69). Who: appointing party. Checks delivery per production
  methods (e.g. security) and contents against EIR incl. acceptance criteria, MIDP dates, level of information need.
  Accepted = Published, appointed party publishes with an "A" status code (NA.4.2). Rejected = lead instructed; amended
  by the relevant appointed party; resubmit. Published information becomes reference information for other delivery
  teams and may trigger a new appointment process.

---
## 5.8 Project close-out (PROJECT)
- **5.8.1 Archive the project information model** (Part 2 p.70). Who: appointing party. Individual containers reach the
  CDE archive during production; this archives the whole PIM as the definitive final version. No further guidance.
- **5.8.2 Capture lessons learned for future projects** (p.71). Who: p.71 names appointed party primary, lead
  contributing; the flow (p.99) shows appointing party and lead; p.16/p.22 list it for the appointing and lead
  parties - sources disagree, treat as shared. Level: project and appointment; ideally throughout (p.21). Links to BS
  8536 soft landings, PPE/POE; obligations to take part should be in appointments. Example criteria: required outcomes;
  performance metrics; budget and programme; procurement satisfaction; information management outcomes; user
  feedback; final commercial costs; operational performance; social value; carbon impact.

---
## Glossary
- **Appointing party**: client or party managing information for the client (Part 2 p.9). **Lead appointed party**: appointed
  by the client, coordinates its delivery team's information with the appointing party (pp.9, 18). **Appointed party**:
  appointed by the lead, "the party that provides the information" (p.9). **Task team**: unit producing information; maps
  one-to-one, one-to-many or many-to-one to appointed parties (Part 2 p.24; Part E p.25). **Delivery team**: lead + its
  appointed parties (p.12). **Project team**: appointing party + all delivery teams (p.12).
- **EIR**: exchange information requirements, appointment-specific (p.37). **PIR**: project information requirements,
  includes organizational information requirements (**OIR**) (pp.30, 37). **AIR**: asset information requirements.
- **BEP**: BIM execution plan; pre-appointment BEP in tender, confirmed delivery team BEP at appointment (Part E p.23).
  **TIDP**: task information delivery plan; **MIDP**: master information delivery plan = collated TIDPs (pp.52-53).
  **LOIN**: level of information need. **DTCCA**: delivery team capability and capacity assessment (CDBB BEP p.22).
  **PIM/AIM**: project/asset information model (AIM is a subset of PIM, CDBB BEP p.11).
- **Information container**: unit with unique ID, status, revision, classification (Part 2 pp.35, 63). 2021 NA: ID
  convention applies to files (p.73).
- **CDE states**: not listed in these sources; named are work in progress, shared, Published (Part 2 pp.97, 67), archive (p.70).
- **Suitability/status codes** (Part 2 pp.84-87; full table and S0 not given): 2021 NA Shared S1-S3 aligned with 5.6.5
  review, S4 with 5.7.1 (submit for lead authorization), S5 new for 5.7.3 (appointing party review/acceptance), S6/S7
  removed. Published A1..An (purpose of each defined in the information standard, e.g. A4 suitable for construction, A5
  as construction record under RIBA 2020); CR removed; B codes deprecated. 2018 NA had S6/S7 and CR; p.66 follows it.

## Gaps
No clause text for: 5.3.5 eleven elements, 5.3.4/5.3.7 contents, 5.4.1 full list, 5.4.3 steps, 5.4.4 TIDP minimum
contents, 5.3.6 criteria. CDE state list and full status table deferred to Guidance C / the NA. Part E section 3
(production methods and procedures) is "in development" (p.22).
