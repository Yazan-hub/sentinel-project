# Writing a BEP: what practitioners find hardest, and what Sentinel should do about it (October 2026)

Research for the founder's question: how do people deal with writing BEPs and related documents (EIR response, responsibility matrix, MIDP/TIDP), what is the worst part, what obstacles do they hit, and how do they get past them. The founder named three hard parts from his own work: (1) describing the office's own capabilities so the BEP is complete, (2) applying ISO 19650 together with the office's own standards, (3) coordinating the BEP with the other disciplines.

This report builds on `docs/research/bim-documents-platforms-2026-10.md` (the "companion report"). Gap numbers G1 to G14 and the "proposals" refer to its sections 4.4 and 5. Platform comparisons are not repeated here.

**How to read this.** Every claim comes from a source in section 6. Most sources are practitioner opinion (LinkedIn articles, blogs), vendor or training articles, and official guidance written as instructions. There is one mixed-methods study with numbers (UCL, Pitt and Panagiotidou: 15 interviews, 41 survey responses, UK information managers). "Voices" below counts distinct authors or organisations, not articles. One person writing three pieces counts once. A voice count tells you how often a problem was raised in what was found, not how common it is in the industry. Reddit, Stack Exchange, LinkedIn profiles and YouTube could not be read (section 5).

**Survey numbers.** Where the UCL study is cited, "mean x/5" is the average survey score for that factor and "y % of interviewees" is the share of the 15 interviewees who raised it. The paper is a pre-proof, so the wording may change.

---

## 1. Summary: the ten pain points that come up most

Ranked by number of independent voices, then by strength of evidence (survey numbers, then official guidance, then practitioner posts).

| # | Pain point | Voices | Strongest evidence |
|---|---|---|---|
| 1 | **The client's EIR is missing, thin or vague, so the bidder's BEP inherits the ambiguity** | 11 | UCL: highest-scoring factor of all, mean 4.63/5, raised by 27 % of interviewees. UK BIM Framework Guidance E admits the client may give a template, headings only, or nothing at all. Also Laguna, Fugas, Ford, ACEI, the Malaysian interview study, DePalma, CDBB/CIOB SME roundtable, Evans, NHSScotland. |
| 2 | **Skills and understanding of ISO 19650 differ between parties; the causes are people and process, not software** | 9 | UCL: mean 4.27/5, 33 % of interviewees. Malaysian study (20 interviews): 11 of 18 coded causes were about people, 6 about process, 1 about technology. NBS 2020 (over 1,000 respondents): 48 % named lack of training as the main barrier. Also Miller, Abbas, Guignone, Revizto, QeCAD, Panagiotidou. |
| 3 | **The tender BEP promises more than the team can deliver** (BIM uses, people, capability) | 7 | UCL: delivery team's ability to turn the EIR into a BEP, mean 4.00/5. CDBB toolkit lists the evidence asked of bidders. Also Lozinski (7D, VR, drones accepted at bid), Laguna (named CVs never join), A400, Studio Matrx, Panagiotidou. |
| 4 | **Scope of modelling unclear: what is modelled, to what detail, by whom, when; LOIN applied inconsistently** | 7 | UCL: LOIN inconsistency, mean 3.71/5, 33 % of interviewees. ACEI advice note: old LOD/LOI wording is open to interpretation, cite EN 17412-1. Also Lozinski, SEI (STRUCTURE magazine), Laguna, Revizto, QeCAD. |
| 5 | **Responsibility gaps and overlaps; roles unclear** | 7 | No survey number. UK BIM Framework Guidance F has two sections on matrix misconceptions (headings confirmed, text not read). Laguna: sanitary equipment modelled twice, roads owned by nobody. Also Guignone, ACEI, Studio Matrx, Revizto, DePalma. |
| 6 | **One person writes the BEP; the other disciplines do not shape it or own it** | 6 | UCL: BEP concentrated in one information manager, mean 3.76/5, 33 % of interviewees. Guidance E: the tender BEP is often written before the delivery team exists. Also Lozinski, Laguna, A400, Guignone. |
| 7 | **The BEP goes stale, and lives as a static Word/PDF file** | 6 | UCL: nobody clearly owns updates, mean 3.98/5; static Word/PDF raised by 40 % (mean 3.76); weak version control 20 %. Also Lozinski, the Malaysian study, SEI, Guidance E, Designing Buildings. |
| 8 | **The BEP is filed and not followed, and deliverables are never checked against it** | 6 | Iranian case studies of 28 firms list BEP non-compliance as a barrier. Malaysian study: consultants who wrote it do not refer to it. Also Lozinski, Laguna, Studio Matrx, SEI. |
| 9 | **Copied old BEPs and over-long templates** | 6 | CDBB BEP guidance tells users to omit sections that do not answer the EIR, which shows people fill the whole template. Also Lozinski, Laguna, Guignone, SEI, Jordan (Plannerly). |
| 10 | **Contracts and appointment documents do not match the BEP** | 5 | UCL: mean 4.05/5, 33 % of interviewees. Guidance E: without an incorporated information protocol there is no clear duty to comply. Also ZIGURAT, Laguna, CDBB BEP guidance. |

Just below the ten: MIDP/TIDP kept in spreadsheets and collated by hand (3 voices: HS2 JV, UCL mean 3.66, Morta snippets), and the clash between the office's standards and the client's information standard (section 2.2).

**The worst part, in one line.** Across the sources, the worst part is not writing the text. It is writing a plan before the client has said clearly what it wants (1) and before the people who must follow the plan have agreed to it (6). The BEP then promises things nobody has checked (3), and nobody keeps it up to date (7).

---

## 2. The founder's three hard parts

### 2.1 Describing the office's own capabilities

**What practitioners say.** No source found was a small office writing first-hand about this (section 5). The evidence is indirect:

- Panagiotidou (architect, ISO 19650 specialist, BIM Coordinators Summit 2023 talk): there is no agreed way to assess capability, maturity models are fragmented, small firms struggle with the cost and resources of assessment, and the standard says little about skills. She offers no fix for small firms.
- The CDBB BIM Toolkit asks bidders for a CV or competence statement for each information-management function, a software schedule with versions, an IT assessment, and evidence of past CDE use, security plans, QC procedures and training. It does not say how much evidence is enough.
- Laguna (Swissroc, Poland): people named in the tender to win the job later leave, and nobody checks.
- Lozinski and BIM Corner: bidders accept advanced BIM uses (7D, VR, drones) without understanding what they cost to deliver.
- A400: plans ignore the team's real strengths and limits.
- Studio Matrx (teaching content): the BEP is "written to win the job and then filed and forgotten".

**Causes.** No common yardstick for capability. A tender culture that rewards claims over evidence. Uncertainty about what the pre-appointment BEP is for: Guidance E says people used to the single PAS 1192-2 BEP misread ISO 19650-2, which moves capability and capacity, the mobilisation plan, the risk register and delivery plans into documents of their own. A "comprehensive" BEP that holds everything may be the wrong target (section 4).

**What worked.**

- Answer with evidence where you have it, and with a commitment where you do not. The CDBB toolkit accepts past-project evidence, internal standards, or a statement of commitment plus a training plan. It also says the best-scoring bidder is not necessarily the most experienced but the one committed to meeting the requirements, and suggests a 40:30:30 weighting of cost, quality and experience. A small office can therefore put training in the mobilisation plan instead of claiming experience it lacks.
- Two stages (Guidance E, Studio Matrx): a short pre-appointment BEP as tender evidence, then a confirmed BEP after an honest capability check between award and contract.
- Agree the BIM uses with the client and price them (Lozinski, BIM Corner).
- At post-appointment, check the declared people are actually on the project (Laguna).
- A small London practice (Miller, NBS, 2012, pre-ISO 19650) built an in-house BIM manual, plan of work and BEPs, with an in-house champion and short training modules. It found the process change, not software cost, was the real difficulty.

**What Sentinel's documents workspace should do.**

1. **Office capability register, kept once at office level.** People with their information-management roles and competence, software schedule with versions, hardware/IT, past projects, training plan. Each line is marked **evidenced** (a past project, a certificate, or a Sentinel record) or **committed** (a training or mobilisation action with an owner and a date). This is Sentinel's existing "declared vs controlling" idea applied to capability. It fills the "capability/capacity summary" in G3 and needs typed blocks (G2). READINESS and the `office.*` checks (`office-checks.mjs`) already measure some of these items, and their measured results should appear as evidence lines.
2. **Pre-appointment BEP pulls from the register through a facts block** (the G5 proposal), so the office is described once and not retyped per bid. The template stays short and links to the capability summary and mobilisation plan as separate documents, as Guidance E requires (G3).
3. **BIM uses table** in the pre-appointment BEP: each accepted use must name an owner and a resource from the register, or carry a "needs training/subconsultant" flag. A use with neither is shown as unsupported before the bid goes out.
4. **Check on the confirmed BEP: "people named in the tender are members of the project"**, bound to the members list. This is a new check in `check-registry.mjs`, and it follows the G9 proposal to ship templates with sections already bound.

### 2.2 Applying ISO 19650 together with the office's own standards

**What practitioners say.**

- CDBB BEP guidance: section 3 of the pre-appointment BEP is the only place to propose changes to the client's information standard and production methods. Anything proposed becomes contractual, so propose only changes that help delivery (for example a room reference system, or extra clash methods), do not restate the client's content, and write "no proposed changes" if there are none. Agreed changes move into the project-wide resource, not the BEP.
- Ford (Galliford Try, 2022): under ISO 19650 the client owns the project information standard, may not realise it, and may have nobody to update it. Fixes to the naming convention then stall mobilisation, and proposals cannot sit in the appointment BEP.
- Ford (2019): teams think compliance means new named documents and new words, and that everyone must read the standard. Instead, one manager interprets the standard and issues internal protocols. Keep familiar terms but define how they map to ISO 19650 terms. Compliance is about tasks and outputs, not document names.
- Evans (Lawray Architects): keep adaptable BEP templates for both 1192 and 19650 projects.
- Jordan (Plannerly, vendor): office templates are published without history and lessons are kept in separate files, so mistakes repeat.
- NBS 2023 (723 respondents): only 27 % define BIM as following ISO 19650 (55 % of BIM specialists), and 22 % still cite BS/PAS 1192. Offices are working with mixed vocabularies.
- Designing Buildings and RIAI (SME guide): small practices think compliance needs enterprise systems and every clause at once. They should build up step by step: naming, version control, approval workflow, status codes, one CDE.

**Causes.** ISO 19650 gives the client ownership of project-wide standards. Office standards (naming, parameters, QA) were written before the standard or for other clients. The tender is the only window for proposing changes, and the gap between award and contract is short.

**What worked.** One office template with only the universal content, and project parts written fresh (Lozinski, BIM Corner). A term map rather than renaming everything (Ford 2019). Propose few changes, state "none" explicitly (CDBB). At tender, ask who will update the project information standard and how fast. Offer to maintain it if the client has nobody, and log the risk, for example "amendments submitted for acceptance within 14 days" (Ford 2022). A pre-implementation audit and updated office policies (Abbas).

**What Sentinel's documents workspace should do.**

1. **Office layer and project layer.** An office template library edited through forms (the G13 proposal), where each block is tagged *office-universal* or *project-specific*. Each document records the template and template version it came from (G13), so a later office change can be offered to open projects.
2. **"Proposed changes to the client's standard" as a structured block, not prose.** It is generated by comparing the office naming ruleset with the client's information standard using the existing `diffNaming`. It shows only the differences, and defaults to the explicit sentence "No proposed changes". After acceptance the agreed result installs as the project's `naming@n`, the existing install path. That keeps agreed changes in the project resource, as CDBB requires, not in the BEP.
3. **Owner of the project information standard** as a required field in the pre-appointment BEP, plus a change request with a response deadline. This uses the review round with a deadline from the G6 proposal.
4. **Term map block** (office term to ISO 19650 term) in the office template, shown as a glossary in the document view. The same block answers the "link abbreviations to explanations" advice in section 3.
5. **Lessons register linked to templates** (low confidence: one vendor source). When a project closes, a lesson can be attached to a template block, and it appears as guidance the next time that block is used. This uses the per-section guidance in the companion's "Guidance and start" proposal.

### 2.3 Coordinating the BEP with the other disciplines

**What practitioners say.**

- A single author produces a plan that each discipline reads differently, and the main participants never review it (Lozinski and BIM Corner, UCL 33 % / mean 3.76, A400).
- The BIM manager sets rules without confirming them with the designers who must follow them (Laguna).
- At tender the delivery team may not exist yet. The lead party must propose the responsibility matrix, federation strategy and delivery plans without the other disciplines (Guidance E). A CEN/TR working draft notes that collaborative aspects cannot be specified before appointment when there are several lead parties.
- The BEP is not shared with everyone who needs it (commenters on Lozinski's post).
- Coordination breaks in practice: unplanned exchanges, infrequent exchange, unprepared workshops, software version mismatches (DePalma, 2015). Origins, tolerances and units drift between disciplines, and teams argue about LOD before agreeing who uses the model and why (SEI).
- TIDPs stay separate per discipline and are not synchronised with the MIDP or the programme (Morta snippets, low confidence). On HS2, collating 60+ work-package plans in Excel/VBA was manual and unversioned (HS2 JV).
- With several lead parties, coordinating EIR, BEP and MIDP across organisations fragments and details get missed (UCL, mean 3.63). In Iran, other task groups fail to finish their tasks (28-firm case study).

**What worked.**

- Discuss each section with every main participant and check the draft with them before issue (Lozinski, BIM Corner, UCL interviewees).
- Lead party confirms the BEP with subconsultants, using a RACI table and a model production and delivery table that gives each element one author (Laguna).
- During the tender, let prospective appointed parties contribute. Keep the tender matrix high-level (elements against responsible party), and detail it after appointment in the detailed responsibility matrix, MIDP and TIDPs (Guidance E, CDBB).
- Define who sends what, when, and through which channel. Identify the model's users before setting LOD. Fix the model freeze point, coordinates and precision on day one (SEI). Keep a fixed exchange rhythm and agree software versions across the project (DePalma).
- One central deliverables list, a dedicated MIDP manager, eight months of training, and only MIDPs extracted from the central list go to the client (HS2).
- Interdisciplinary meetings run by a coordinator; roles defined by function, not title (Guignone).

**What Sentinel's documents workspace should do.**

1. **Section owners per task team**, picked from project members (the G12 proposal). A "my sections" view across documents, so each discipline sees what it must write or confirm.
2. **Review round with one accept or reject per appointed party**, a deadline, and read tracking, written to the ledger (G6 and the "Sign-off" proposal). "Confirmed with the team" then becomes a recorded fact instead of a claim.
3. **Responsibility matrix as a table block** (G2): high-level at tender, expanding into the detailed matrix after appointment, in the same lineage (G5). Add a new check that every element row has exactly one responsible party. That catches Laguna's "modelled twice, owned by nobody" before production starts.
4. **TIDP as the MIDP filtered by team** (G4), so each discipline edits its own rows in `deliverables` and nothing is collated by hand.
5. **Exchange schedule block** (who sends what, when, by which channel, cadence) that binds to a check on actual CDE uploads. This turns "models will be coordinated regularly", the vague clause Studio Matrx warns about, into something Sentinel can check.
6. **Shared set-up facts block** (coordinates, units, tolerances, software versions, freeze points), filled once in the facts block (G5) and referenced by every discipline's section.
7. **Tender-stage contributor access**: invite prospective appointed parties to the pre-appointment BEP as contributors to their own sections only, so the delivery team can shape the plan during the tender, as Guidance E recommends.

---

## 3. Pain points the founder did not name

Each item: evidence, what helped, and what it means for Sentinel.

**3.1 Bidding against a vague or missing EIR** (rank 1). *Evidence:* UCL mean 4.63/5, the top factor. Small or immature clients cannot say what they need, and the paper's only implication is that the supply chain has to explain its approach in more detail and state its assumptions. Ford (2019): unclear EIRs are answered "yes" at tender, and suppliers end up writing the EIR. Fugas: models comply but cannot be used, because clients ask for information they never use and for undefined buzzwords. ACEI: when there is no EIR, the designer carries the scope and fee risk. *What helped:* challenge unclear EIR clauses in the tender response, state what will and will not be provided, and get all appendices (Ford). State the fee basis and assumptions (ACEI). If the client is not following ISO 19650-2, tell them so explicitly and still cover the seven items in clause 5.3.2 (Guidance E). *For Sentinel:* an **EIR clarification and assumptions log** in the pre-appointment BEP: one row per EIR clause with answered / assumed / excluded / query, generated from an ingested EIR (the ingest path exists). This is the companion's optional "EIR requirement → BEP response" proposal, and the research says it is worth making required. Add a **"No EIR received" start** that creates the Guidance E statement and a clause-5.3.2 checklist.

**3.2 Not knowing what the pre-appointment BEP is for.** *Evidence:* Guidance E says people used to PAS 1192 treat it as the finished plan, when it is only evidence that the team can meet the EIR. CDBB says section 3 belongs only in the tender version. *What helped:* a short tender BEP, then a confirmed BEP between award and signature, with change management after that. *For Sentinel:* a **pre-appointment BEP template** (G3), plus **lineage** from the pre-appointment to the confirmed BEP (G5). The confirmed version shows what changed since the tender, using the G7 compare view.

**3.3 The BEP is not read and not followed** (rank 8). *Evidence:* Lozinski: long, text-heavy and full of jargon. Malaysian study: complexity makes people lose interest. SEI: templates stress formatting and software, not people and decisions. Iranian case studies. *What helped:* visuals and tables, process maps and exchange sheets, linked abbreviations, a test of whether a non-expert can follow it (Lozinski). A living one-page summary reviewed weekly (SEI). *For Sentinel:* tables and process steps as blocks (G2). A **one-page summary view** generated from the blocks (who sends what, when, to whom). The term map from 2.2 as a glossary. Sentinel already differs here: a bound clause is checked against project data, so "not followed" shows up as a failing check. That only works if templates ship with sections already bound (G9, BEP scores 0 % today).

**3.4 The BEP goes stale** (rank 7). *Evidence:* UCL means 3.98 (no clear update owner) and 3.76 (static files, raised by 40 %). Lozinski: people work from old emailed copies. *What helped:* a design change triggers a revision, the BIM manager reviews periodically, and the BEP is hosted online with the current version on page one (Lozinski). Audit at each milestone (Malaysian study). *For Sentinel:* Sentinel is already a web page and not a file, which is what practitioners asked for. Add a **revision trigger**: when a stage changes or a member's role changes, a "review due" notice appears on the sections that depend on it. Also add a version compare and relabel (G7), and a revision table on the export (G8).

**3.5 Copied BEPs and template overload** (rank 9). *Evidence:* copying an old BEP takes longer than starting fresh and carries wrong assumptions (Lozinski). Templates applied without changes (Guignone). Users fill every CDBB heading and copy the worked examples. *What helped:* omit sections that do not answer the EIR (CDBB). Keep an office template with only universal content (Lozinski). *For Sentinel:* the template picker with **minimal and full variants and "when to use"** (the "Guidance and start" proposal). Sections can be removed (G1), and a section with no EIR clause behind it is flagged as optional.

**3.6 Scope of modelling and LOIN** (rank 4). *Evidence:* UCL mean 3.71. ACEI: legacy LOD/LOI wording is ambiguous. SEI: argue about the model's users first, then LOD. QeCAD: over-modelling. *What helped:* process map per BIM use, then exchange sheets saying what, what detail, who, when (Lozinski). LOIN per stage citing EN 17412-1, leaving out-of-scope stages blank (ACEI). Acceptance criteria checked automatically with IDS (Fugas). *For Sentinel:* **LOIN as a table block** (element, milestone, property, value, plus a "used by / why" column) that compiles to IDS and implements `loin.levels` (the G9 proposal). The "used by" column puts SEI's order (users first) into the form.

**3.7 Contracts and appointment documents** (rank 10). *Evidence:* UCL mean 4.05: legal teams write incomplete or contradictory BIM clauses. Guidance E: without an incorporated protocol there is no clear duty to comply, and cross-references go stale. ZIGURAT: model IP ownership unclear. *What helped:* the UK BIM Framework information protocol template, the incorporation clause in every appointment down the chain, references to the latest versions, legal advice. *For Sentinel:* an **information protocol template** (G3), and appointment references that always point to the latest published version through the lineage (G5). Sentinel cannot give legal advice, and the template should say so.

**3.8 MIDP/TIDP in spreadsheets.** *Evidence:* UCL mean 3.66 (13 % raised Excel). "A lot of LAPs avoid setting up a MIDP" (INT5). HS2 needed a central list, a dedicated manager and eight months of training. *For Sentinel:* G4 (MIDP and TIDP as views of `deliverables`). The planned-vs-actual view from `deliverableStatus` covers the "monitoring needs manual effort" complaint (27 % of UCL interviewees).

**3.9 Set-up skipped before modelling starts.** *Evidence:* A400: teams skip georeferencing and data-management set-up ("we can do it later"). SEI: coordinates and precision fixed on day one. DePalma: software versions not agreed. *For Sentinel:* the set-up facts block from 2.3, with READINESS items that stay open until it is filled in and agreed.

**3.10 Delivered models are never checked against the BEP.** *Evidence:* Laguna (Polish public procurement). *For Sentinel:* this is the strength Sentinel already has (bindings, IDS, naming install, ledger). The gap is coverage: implement the three planned checks (`loin.levels`, `qa.scorecard`, `federation.breakdown`) and ship BEP/EIR templates already bound (G9).

**3.11 Skills, training and change in a small office** (rank 2). *Evidence:* UCL 4.27. Malaysian study: people causes outnumber technology causes 11 to 1. NBS 2020: 48 % cite training. NBS 2023: adoption is 56 % for organisations of 15 staff or fewer, and 23 % of those have no plan to adopt. Miller: process change, and staff going back to CAD under pressure. *What helped:* an in-house champion, short training modules, a boot camp for new starters (Miller). One person interprets the standard and issues internal protocols (Ford). *For Sentinel:* software cannot fix most of this, and the report should not pretend it can. What helps: short guidance per section in plain words, the glossary, and training actions recorded as "committed" lines in the capability register (2.1), so training needs show up in the mobilisation plan rather than staying hidden.

**3.12 Lessons do not feed back** (one vendor voice, low confidence). Jordan (Plannerly): lessons kept in separate files, symptoms fixed instead of root causes. See the lessons register in 2.2.

**3.13 Different CDEs do not exchange data** (UCL mean 3.63; CDBB/CIOB roundtable: SMEs get compliant CDE software only with costly changes). This is outside the documents workspace and is noted here only for completeness.

---

## 4. Contradictions

1. **Comprehensive vs short.** The founder wants a comprehensive BEP. Official guidance and most practitioners want a short one. Guidance E: a succinct pre-appointment BEP, with capability, mobilisation, risk and delivery plans in their own documents. CDBB: omit sections that do not answer the EIR. SEI: work towards a living one-page document. A400: keep it brief. Yet the CDBB template itself has 20+ headings with worked examples, and Revizto suggests 2 to 4 weeks to write one (1 to 2 with templates). The way to reconcile them: be complete across the *set* of documents, and keep each document short. For Sentinel this means linked documents (G3, G5) rather than one long BEP.
2. **Template reuse.** BIM Corner (Lozinski) says copying an old BEP is worse than starting fresh. The 2026 Designing Buildings guide warns against writing from scratch every time. Both end up recommending the same thing: a template with only universal content, plus project parts written fresh.
3. **Experience vs commitment at tender.** Tender forms ask for named CVs and past evidence (CDBB toolkit, NHSScotland's scored capability pack). The same CDBB toolkit says the best bidder is the committed one, not the most experienced. Laguna reports the named people often never arrive. Evidence and commitment are both accepted, but they need to be labelled as one or the other.
4. **Who should hold the standard.** Ford: one manager interprets ISO 19650 and issues internal protocols, so not everyone has to read it. Lozinski and UCL: a BEP held by one person is a main cause of failure. These fit together if one person *interprets the standard* and the whole team *writes the plan*. Sentinel's section owners and review round fit that split.
5. **The official route vs what happens.** ISO 19650-2 expects the client to write the EIR and own project standards. In practice clients skip it, suppliers write their own EIR, and nobody maintains the information standard (Ford 2019 and 2022, UCL). Guidance E acknowledges this and tells bidders what to do anyway. Sentinel's templates should assume the non-ideal case is normal, which is Ford's own advice ("train for non-ideal cases").
6. **Documents vs tasks.** Ford: compliance is about tasks and outputs, not document names. Sentinel and every platform in the companion report organise work by named documents. That is fine if each block is tied to a check or a record. A named document with no bound check is what Ford warns about.
7. **What is contractual.** ZIGURAT: make the BEP contractually binding. CDBB: agreed changes sit in the appointment and project resources, not in the BEP. Guidance E: the BEP is live and changes, so contract references to it go stale. The sources disagree. Sentinel should version every document and let appointments cite a specific version, and not decide the legal question.
8. **LOD vs LOIN.** ACEI says legacy LOD/LOI terms are ambiguous and points to EN 17412-1. Revizto and QeCAD still recommend LOD tables per stage. The LOIN block should use EN 17412-1 terms and accept LOD only as a label.
9. **Complaint vs tolerance.** Static Word/PDF BEPs were raised by 40 % of UCL interviewees, the most-mentioned item, but scored only 3.76/5. People complain about static files but put up with them. A web-native BEP alone will not win anyone over. The checks and the reduced re-typing have to be the reason.

---

## 5. What the research could not find, and how much to trust this report

**Not found.**

- **No first-hand account from a small office** describing its capabilities in a BEP, reconciling office standards with ISO 19650 or a client EIR (precedence clauses, naming conflicts), or negotiating responsibility matrices and TIDP inputs with other disciplines. The founder's hard parts 1 and 2 are therefore covered only indirectly: official templates and their warnings, Ford's contractor view, Panagiotidou's talk, and one 2012 small-practice account from before ISO 19650.
- **No practitioner write-ups on LOIN in practice.** Searches returned unrelated LOINC results or definitions only.
- **No time figure for writing a BEP** except Revizto's 2 to 4 weeks (vendor).
- **Not readable or not reached:** Reddit and Stack Exchange (blocked for the search tool), LinkedIn profiles and YouTube, Autodesk forum, BIMcollab community, UK BIM Alliance/nima threads, the imiframework.org FAQ (403), UK BIM Framework Guidance F and Guidance A/Part 2 (only headings confirmed), the Rahman papers (abstract only), the Panagiotidou 2023 review of 36 BEPs (paywall, abstract only: 29 topics, no common structure), the Stantec article, a Malaysian UKM paper, the Mott MacDonald handout, and the SFT/Okana report (snippets only). Nothing was found from Plannerly beyond slides, BIMheroes, Dalux, Bimspot, Catenda, Operam, BIM Academy, Bond Bryan, Ryder, Scottish Futures Trust, NZ BIM Handbook, Transport for NSW, Singapore BCA, BSI or BRE.
- **Unverified:** the Designing Buildings claim that the 2026 ISO 19650 revision renames the BEP. Several pages dated 2026 could not be checked further.

**Overlaps that reduce independence.** The Lozinski LinkedIn post and the 2020 BIM Corner article appear to be by the same author and are counted as one voice. Ford's three pieces count as one. The two Malaysian entries (Rahman et al. and the Planning Malaysia download) look like the same 20-interview study and are counted once. Panagiotidou is involved in the blog, the UCL study and the 2023 review, so these are not fully independent of each other.

**Confidence.**

- **Medium** for the ranking of general pain points (section 1). They are consistent across about 30 voices in several countries (UK, Poland, Ireland, Malaysia, Iran, US), and the top items are backed by the UCL survey. But the sample is small (41 responses) and the paper is a pre-proof.
- **Low to medium** for the founder's hard parts 1 and 2: indirect evidence, mostly official guidance read for its warnings.
- **Medium** for hard part 3: several practitioner voices, the UCL numbers and Guidance E agree.
- **The feature proposals are inferences**, not findings. They follow from the resolutions the sources report and from the companion report's gaps. None has been tested with users. Treat them as candidates for the founder to rank, alongside the companion report's open questions.

---

## 6. Sources

Practitioner articles and posts

- Lozinski, LinkedIn post: https://www.linkedin.com/posts/ignacy-lozinski-6a870963_most-bim-execution-plans-are-not-read-or-activity-7104381413520551936-2qCI
- BIM Corner, "Why most BIM execution plans fail" (2020): https://bimcorner.com/why-most-bim-execution-plans-fail/
- BIM Corner, Guignone on roles (2026): https://bimcorner.com/?p=45453
- BIM Corner, Fugas on EIRs (2026): https://bimcorner.com/?p=45569
- Laguna, Swissroc, "BIM Execution Plan" (2023): https://www.linkedin.com/pulse/bim-execution-plan-bep-sr-buildingintelligence
- A400, "8 common mistakes to avoid in BIM coordination" (2023): https://www.linkedin.com/pulse/8-common-mistakes-avoid-bim-coordination-a400
- DePalma, "Staying out of the BIM red zone" (2015): https://www.linkedin.com/pulse/staying-out-bim-red-zone-early-indicators-project-headed-rich-depalma
- Abbas, "Implementing ISO 19650" (2021): https://www.linkedin.com/pulse/journal-4implementing-iso19650-nadim-abbas
- Panagiotidou, information management skills (2023, updated 2025): https://www.breakwithanarchitect.com/post/information-management-skills-according-to-iso-19650
- Miller, small practice on NBS (2012): https://www.thenbs.com/knowledge/bim-from-the-point-of-view-of-a-small-practice
- Ford, "When 19650's BIM-enabled process doesn't go to plan" (2019): https://constructionmanagement.co.uk/digital-construction/when-19650s-bim-enabled-process-doesnt-go-plan/
- Ford, "Transition from 1192 to 19650" (2019): https://architecturaltechnology.com/resource/transition-from-1192-to-19650-avoiding-the-early-mistakes.html
- Ford, "The unforeseen challenges of ISO 19650's project information standard" (2022): https://constructionmanagement.co.uk/the-unforeseen-challenges-of-iso-19650s-projects-information-standard
- Evans, "The BIM adoption challenge" (2022): https://constructionmanagement.co.uk/digital-construction/the-bim-adoption-challenge-youre-not-alone/
- SEI Committee on Digital Design, STRUCTURE magazine (2026): https://www.structuremag.org/article/bim-execution-plans-towards-a-one%E2%80%91page-communication-backbone/
- Studio Matrx, "Writing a BIM execution plan" (teaching content, 2026): https://www.studiomatrx.org/students/building-information-modelling/writing-a-bim-execution-plan
- Designing Buildings, "Guide to ISO 19650 for architecture firms (2026)": https://www.designingbuildings.co.uk/wiki/Guide_to_ISO_19650_for_Architecture_Firms_%282026%29
- RIAI, BIM Pack 2 and SME guide (2022): https://www.riai.ie/whats-on/news/riai-bim-pack-2-update-iso-19650-series-and-bim-guide-for-smes

Vendor and training articles

- Jordan (Plannerly), "Five key lessons learned implementing ISO 19650": https://www.slideshare.net/slideshow/five-key-lessons-learned-implementing-iso-19650-episode-06/250136567
- ZIGURAT, BIM BEP and contracts (2025): https://www.bimcommunity.com/brand-article/bim-bep-contracts/
- Revizto, "Creating a successful BIM execution plan" (2025): https://revizto.com/en/creating-successful-bim-execution-plan/
- QeCAD blog: https://www.qecad.com/cadblog/?p=6054
- Morta, information delivery plan use case (snippets only): https://blog.morta.io/use-cases/information-delivery-plan

Research papers

- Pitt and Panagiotidou (UCL), pre-proof, Next Research (2026): https://discovery.ucl.ac.uk/10225319/1/Pitt_Pre-proof.pdf
- Rahman et al., Planning Malaysia (2024), abstract: https://research.daffodilvarsity.edu.bd/scopus-article/4610
- Rahman et al., Lecture Notes in Civil Engineering (2024), abstract: https://research.daffodilvarsity.edu.bd/scopus-article/5371
- Planning Malaysia (2024), full text: https://www.planningmalaysia.org/index.php/pmj/article/download/1492/1171
- Iranian private-sector case studies (2023): https://sjce.journals.sharif.edu/article_23072.html?lang=en
- Panagiotidou, Pitt and Lu, review of 36 BEPs (2023), abstract: https://www.emerald.com/jsmic/article/176/3/126/511588/Building-information-modelling-execution-plans-a
- Geoghegan et al., Dutch small architectural practices (2023), abstract: https://researchportal.bath.ac.uk/en/publications/innovation-realisation-for-digitalisation-within-dutch-small-arch/

Surveys and roundtables

- NBS BIM Report 2020 (via PBC Today): https://www.pbctoday.co.uk/news/bim-news/2020-bim-report/87016/
- NBS Digital Construction Report 2023 (via Designing Buildings): https://www.designingbuildings.co.uk/wiki/NBS Digital Construction Report 2023
- CDBB/CIOB SME roundtable (2019): https://www.cdbb.cam.ac.uk/BIM/UKBIM/CDBB_CIOBRoundtables/2019BIMRoundtable5

Official guidance

- UK BIM Framework Guidance Part E, Tendering and appointments, Edition 2 (2021): https://www.ukbimframework.org/wp-content/uploads/2021/02/Guidance-Part-E_Tendering-and-appointments_Edition-2.pdf
- CDBB BIM Toolkit, BEP guidance: https://www.cdbb.cam.ac.uk/files/bep_guidance.pdf
- CDBB BIM Toolkit, capability and capacity assessment guidance: https://www.cdbb.cam.ac.uk/files/cca_guidance.pdf
- HS2 Learning Legacy, "Super MIDP" (2022): https://learninglegacy.hs2.org.uk/document/super-midp-master-information-delivery-plan/
- ACEI, BIM advice note for building services engineers (2023): http://www.acei.ie/wp-content/themes/iBUILDiT/uploads/ACEI_ME_BIM_Advice_Note_Dec_2023.pdf
- NHSScotland, BIM delivery guidance v02 (2021): https://www.nss.nhs.scot/media/2316/guidance-bim-delivery-v02.pdf

Companion report (internal): `docs/research/bim-documents-platforms-2026-10.md`
