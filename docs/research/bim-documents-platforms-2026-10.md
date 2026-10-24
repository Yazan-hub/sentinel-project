# BIM documents: how other platforms do it, and where Sentinel stands (October 2026)

Research for the founder's request: create and adopt the ISO 19650 documents (pre- and post-appointment BEP, EIR, TIDP, MIDP, responsibility matrix, LOIN, information protocol) in Sentinel at the quality of the best AEC platforms, probably in a separate full-page window.

**How to read this.** Every claim comes from a platform research pass (vendor pages, help centres, pricing pages, search snippets) or from reading Sentinel's code. Nobody used any of these products or looked at screenshots. Most entries are **low confidence**. Only Plannerly (medium) and the CDBB toolkit (high) were researched in depth. Where a cell says "(unverified)", the research could not confirm it. That is not the same as the feature being absent. Vendor claims (Kitemarks, "100% of CDE requirements", "becomes the working plan") are marked as claims.

---

## 1. One-page summary

Of the platforms researched, only **Plannerly** and **Morta** let you write and plan these documents inside the product. The big CDEs (ACC, Catenda, Dalux, Newforma, ProjectWise, Aconex, Trimble Connect) control *files* and *naming*. Their BEP and EIR are uploaded PDFs. The free UK toolkit (CDBB) gives Word and Excel templates with guidance. Requirement tools (BIMcollab, BIMQ, the IDS editors) turn requirements into checks but do not write the plan.

**What the best platforms do that Sentinel does not:**

1. **The document shape can be edited, and it can hold tables.** In Plannerly Docs, a BEP is a set of sections you can edit or replace (including by importing Word). Each section has an owner and a status. In Sentinel the section list is fixed when the document is created, and each body is a plain-text box (bimdocs-store.mjs:66-82, docs-panel.ts:~745).
2. **One record, two views for the MIDP and TIDP.** In Plannerly, Morta and Asite, a TIDP is the MIDP filtered by task team, so there is no second copy to keep in sync. Sentinel has the rows (the `deliverables` table), but its TIDP *document* is a separate prose template that never reads or writes those rows.
3. **Project facts are typed once and appear everywhere.** Plannerly's SmartFields fill in the client name and other facts in every document. In Sentinel, BEP section 1 says "Mirror the project record", but nothing fills it in.
4. **Pre- and post-appointment are one lineage.** Plannerly ships one BEP template with both parts. CDBB has two separate templates (Pre-appointment BEP and Delivery team's BEP). Sentinel has one BEP, titled "post-appointment", and no pre-appointment variant, MIDP, protocol or risk register.
5. **Review that records acceptance.** Plannerly records owner per section, comments, suggestions you accept or reject, a review deadline, who has read what ("Silence isn't agreement"), and e-signature of a contract generated per team. Catenda and ACC have ordered approval chains with fixed outcomes. Sentinel has a four-state status machine, and Publish is one button for a lead.
6. **A formal deliverable.** Plannerly exports a PDF with a cover page, a linked table of contents and a team page. You can add the scope grid and timeline, and combine EIR, BEP and MIDP into one hyperlinked package. Word and Excel export are on the Pro plan. Sentinel prints a page through the browser and shows the Markdown markup as raw text (docs-panel.ts:1337-1338, F-LC-1).
7. **A structured requirements grid that drives checks.** Plannerly Scope defines property, rule, value, unit and property set per element and milestone. It exports this as IDS and runs pass/fail per element, and each failure shows on the owning team's task. BIMcollab does the same with IDS and BCF. Sentinel compiles the EIR to IDS, but LOIN is prose and its check (`loin.levels`) is only planned.
8. **Guidance and starting points.** CDBB pairs every template with a guidance PDF and offers maturity-based entry points. Plannerly and Morta keep company template libraries. Sentinel's create screen is a title box plus four buttons, with nothing saying when to use which (docs-panel.ts:460-480).

**What Sentinel already does that none of the researched tools were shown to do.** A clause scores only if it is bound to a check that Sentinel actually runs (executability.mjs). The document's naming section installs as the enforced naming ruleset. Every write goes to a hash-chained ledger. ACC and Dalux enforce naming, but from settings typed in by an admin, not from the BEP.

**Recommended direction.** Yes to a separate full-page Documents workspace. But the window is not the main change. The main change is the content model. Today a section is a heading plus free text. It should become a document made of typed blocks: text, tables, and live references to records Sentinel already holds (deliverables and task teams, naming ruleset, LOIN rows, project facts). Documents should be linked EIR → pre-appointment BEP → post-appointment BEP → MIDP/TIDP, where MIDP and TIDP are views of the deliverables table, not new documents. Keep the governance core that exists (locking, versions, ledger, bindings, IDS and naming install). Put a review-and-acceptance step and a formal export on top. This follows the Plannerly and Morta pattern (one source of truth, documents as views), and it keeps Sentinel's own advantage: the document runs as checks.

---

## 2. Comparison matrix

Confidence of the underlying research is in the first column. "(u)" means unverified.

| Platform (confidence) | Documents covered | Structured vs free text | Tables / matrices | EIR ↔ BEP ↔ TIDP/MIDP linking | Versions and change list | Review / sign-off | Adoption (drives checks?) | Export | UX (full page?) | Pricing |
|---|---|---|---|---|---|---|---|---|---|---|
| **Sentinel today** (code read) | BEP (post-appointment only), EIR, TIDP, READINESS; MIDP only as the Deliverables table | Free text per section; one ```json naming block | None in documents; deliverables table is separate | None between documents (no parent/stage column, 0020) | Append-only versions; no diff, no relabel | Status machine; lead publishes; comments with no resolve | **Yes**: bound clauses run 14 checks; EIR → IDS; naming installs | Browser Print/PDF, raw markup | No; docked sidebar panel | Own product |
| **Plannerly** (medium) | EIR, BEP (pre + post), OIR/PIR/AIR, TIDP/MIDP, RACI, LOD/LOI, IDS; no protocol or appointment found | Docs = narrative sections; Scope = structured grid | Scope grid, RACI per deliverable, timeline, Kanban | Combined EIR+BEP+MIDP export; EIR requirement → BEP response link (u) | Version history; change list between versions (u); freeze state (u) | Section owners, suggestions, review deadline, read tracking, e-sign per-team contract | Yes, from Scope: IDS export + Verify pass/fail per element. BEP text driving anything (u) | PDF (all plans), Word/Excel (Pro), IDS, COBie | Full-page web workspace per module (u, text only) | Free; Pro $249/399/499 per month for 1/2/3 modules; Company by quote |
| **CDBB / UK BIM Framework toolkit** (high) | OIR, AIR, PIR, EIR, Pre-appointment BEP, Delivery team BEP, MIDP, TIDP, Responsibility Matrix; no protocol or LOIN template listed | Free text (Word) | Excel matrices | Conceptual hierarchy only | None | None | No | Word, Excel, PDF guidance | Not software | Free; licence (u) |
| **NBS BIM Toolkit (retired 2022) / Chorus** (low) | Digital Plan of Work, LOD guidance; Chorus ISO 19650 docs (u) | Deliverables-by-stage tables | Excel (replacement) | (u) | (u) | (u) | (u) | Excel | (u) | Toolkit was free; Chorus (u) |
| **Autodesk ACC / Docs** (low–medium) | No BEP/EIR/TIDP/MIDP authoring found; naming standards, metadata, reviews, transmittals | Naming standard = typed field list | No MIDP/TIDP or RACI editor found | No; via metadata/folders only | File versions; plan-document versions not applicable | Review workflow templates (1–6 steps, group approval, time limit per step); transmittals | Naming rules, yes (Validator + Holding Area); BEP, no | Files; (u) | Admin settings pages (u) | (u) |
| **BIMForum LOD Spec 2025** (medium) | LOD definitions (US), not ISO documents | Reference tables | Excel element × LOD matrix | None | Annual editions | None | No | PDF, xlsx | Not software | Free; licence ambiguous |
| **Trimble Connect** (low) | None found | (u) | (u) | (u) | Revision history on files | Paid third-party extension (sequential reviewers) | None found | (u) | (u) | Conflicting sources |
| **Procore** (low) | Not ISO 19650; RFIs, submittals | Typed records | (u) | (u) | Numbered revisions on rejection | Create → review → close and distribute | Status of items only | (u) | (u) | Quote |
| **Catenda Hub** (medium) | CDE layer; plan documents as files | Not applicable | Not applicable | None found | Minor numbers for shared, major for published | Ordered chain: submitter, N reviewer steps, final reviewer (approved / with comment / rejected); separate "Can publish" permission | Status drives visibility; checks via integrations | (u) | Admin settings pages (u) | (u) |
| **Dalux Box** (medium) | CDE layer only | Metadata fields, mandatory at upload | Not applicable | None found | (u) | Status set only inside an approval step; flows triggered by status + location (Pro) | Naming enforced and parsed into metadata; plan does not drive it | (u) | Settings (u) | Standard vs Pro; prices (u) |
| **BIMcollab Nexus** (low) | Requirements as IDS (≈ EIR/LOIN); no BEP/MIDP | Structured IDS facets (u in UI) | (u) | Requirements → checks → BCF; no BEP/MIDP link | (u) | (u) | **Yes**: IDS drives checks in Zoom | IDS, BCF | Web app (u) | €1,032–1,800 per 10 users per year |
| **Bimplus (Allplan)** (low) | None found in Bimplus itself | (u) | (u) | (u) | Revision management (u) | Approval process (Professional) (u) | (u) | BCF, IFC4 | (u) | Conflicting sources |
| **Thinkproject** (low) | CDE + handover; no plan authoring found | (u) | (u) | (u) | Version control (claim) | Review and approval workflows (claim) | Handover data validation (u if from EIR) | (u) | (u) | (u) |
| **Zutec** (low) | Handover, O&M, safety files; no BEP/EIR/MIDP | Forms, data register | Data register | (u) | (u) | Workflow and forms (u) | Submission format enforced; handover dashboard | PDF, XML, Excel, COBie/IFC (G-Cloud) | (u) | (u) |
| **Morta** (medium) | EIR/AIR/OIR, BEP (as tracker), TIDP/MIDP, responsibility matrix, naming; no LOIN | Typed picklist columns | Tracker tables; RACI linked table feeds the IDP | TIDP = view of the MIDP; RACI → IDP; EIR → BEP (u) | Audit trail, rollback; document versions (u) | Not described (stage gate reviews mentioned only) | **Yes**: planned vs actual from synced CDE metadata; naming deviations flagged | Excel import; export (u) | Full web workspace (u, text only) | £100 per user per month; Team from £1,000/month; Scale Up from £4,500/month; free contributors |
| **BIMQ (AEC3)** (low) | EIR, BEP requirements aligned to LOIN | Structured requirement catalogue (u) | Generates document tables (snippet) | One requirement source → EIR, BEP, IFC mapping, checker rules (snippet) | (u) | (u) | Yes, generates checker rules (snippet) | (u) | (u) | (u) |
| **usBIM (ACCA)** (low) | IDS load/check only | (u) | (u) | (u) | (u) | (u) | IDS checked against IFC (secondary source) | IFC, PDF, XML | Web | (u) |
| **IDS tooling** (Solibri IDS Editor, BIMvision IDS Maker, IfcTester) (medium) | IDS files only | Structured facets | One spec per requirement row | LOIN spreadsheet → IDS (manual/AI); no link back | File-based | None | Yes, checkers run IDS | .ids | Form-style facet editors, no bulk import | Solibri paid; others free (u) |
| **Bimspot** (not found) | Nothing verified; do not rely on it | — | — | — | — | — | — | — | — | — |
| **Asite (Playbook / IDP)** (medium) | MIDP/TIDP strongest; BEP/EIR/LOIN/protocol not found | Structured plan, task and deliverable objects | Responsibility per task (replaces static RACI, claim) | Plan → deliverables → CDE submissions; EIR → BEP not found | Audit log, timestamped revisions; plan versions (u) | Approval gates, escalations | **Yes** (claim): naming, status, purpose of issue enforced from plan; planned vs actual | (u) | Capterra Ease of Use 3.2/5 | Conflicting |
| **Oracle Aconex** (low) | Document register; no plan authoring | Register fields | Register table | None found | Revisions supersede; full audit | Workflow templates + subworkflows; linked comments (2026, snippet) | Configured by implementer, not from a BEP | (u) | Register pages (u) | Quote |
| **Newforma Konekt** (low) | CDE states + naming | (u) | (u) | (u) | Versioned, locked Published | Document Control approval → Published | File state only | Sharing Center (claim) | (u) | Quote |
| **Bentley ProjectWise** (low) | Numbering, CDE areas, transmittals | State, suitability, revision as separate fields (TfNSW guidance) | (u) | (u) | (u) | Check–review–approve workflow (snippet) | Naming/state by configuration | Transmittals | (u) | Quote |

---

## 3. Best practices observed

Each item names the platform and a source from the research. "Claim" means the only evidence is vendor marketing.

**Authoring**
1. **Sections with named owners, visibility per team, filter by status/owner/comments.** Plannerly. https://plannerly.com/use-cases/bep/
2. **One BEP template holding pre- and post-appointment parts**, so the tender BEP becomes the delivery BEP, not a second document. Plannerly. https://plannerly.com/use-cases/bep/
3. **Separate Pre-appointment and Delivery-team BEP templates as two document types.** CDBB. https://www.cdbb.cam.ac.uk/AboutDBB/Promoting-digital-construction-Internationally/international-bim-toolkit. Note: Plannerly and CDBB take different approaches here, and the founder must choose (section 6).
4. **Project facts typed once, filled into every document (SmartFields).** Plannerly (Pro plan). https://www.plannerly.com/pricing
5. **Template plus companion guidance per document, with maturity-based entry points**, so a first-time author starts from a minimal EIR or BEP. CDBB. https://www.cdbb.cam.ac.uk/files/bim_toolkit_overview.pdf
6. **Company template library**: save the agreed BEP, requirements and scope as reusable standards. Plannerly (https://plannerly.com/use-cases/bep/), Morta (https://www.morta.io/solutions/information-management).
7. **Org-level code lists (originator, discipline, spatial, Uniclass) reused as picklists**, which prevents typing errors. Morta. https://www.morta.io/solutions/use-cases/information-standards
8. **Import from Word or Excel with column mapping and validation on import.** Plannerly (Word import into BEP), Morta (Excel IDP import). https://www.morta.io/solutions/use-cases/information-delivery-planning
9. **Optional AI that drafts or tidies a section but never publishes without a human edit.** Plannerly (AI Expand / AI Correct). https://plannerly.com/use-cases/bep/

**Structure**

10. **TIDP = the MIDP filtered by team.** Same rows, two views, no re-keying. Plannerly (https://help.plannerly.com/en/article/68-how-to-create-a-master-information-delivery-plan-midp-in-plannerly), Morta (https://www.morta.io/solutions/use-cases/information-delivery-planning), Asite (https://www.asite.com/blogs/how-asite-playbook-turns-iso-19650-into-a-practical-delivery-engine).
11. **Each deliverable has an accountable team, a responsible person, conditions of satisfaction, milestones and dependencies, and file placeholders with expected types and metadata.** Plannerly. https://plannerly.com/use-cases/midp/
12. **Responsibility matrix as a linked table that feeds delivery rows**, not a static grid. Morta (https://www.morta.io/solutions/use-cases/information-delivery-planning). Asite claims the same with per-task ownership.
13. **Requirements grid: property, rule, value, unit, property set per element per milestone**, seeded from templates or the buildingSMART Data Dictionary. Plannerly Scope. https://plannerly.com/use-cases/model-checking-ids/
14. **Element × phase matrix as a reusable lookup** that seeds the LOD/LOIN table. BIMForum. https://bimforum.org/?p=442
15. **Keep state, suitability and revision as three independent fields.** TfNSW guidance on ProjectWise setup. https://www.transport.nsw.gov.au/system/files/media/documents/2023/Establishing-the-Contractor-CDE-v4.1.pdf

**Review and sign-off**

16. **Comments and suggestions per section, accept or reject, review deadline, who-has-read-what.** Plannerly. https://plannerly.com/use-cases/bep/
17. **Per-team contract generated from the plan**: each team receives only its own deliverables, RACI and timeline, then e-signs. Signed versions are kept. Plannerly. https://plannerly.com/use-cases/midp/
18. **Ordered approval chain with three outcomes** (approved, approved with comment, rejected). Rejected stays Shared, approved becomes publishable, and publishing needs its own "Can publish" permission. Catenda. https://support.catenda.com/en/articles/9874698-user-guide-status-workflow-iso-19650
19. **Review workflow templates with step count, single or all-reviewer rule and a time limit per step.** ACC Docs (search snippet only). https://autodesk.com/learn/ondemand/module/review-and-approve-documents-in-the-cloud-using-autodesk-docs
20. **Status can only be set inside an approval step**, so nobody mislabels by hand. Dalux. https://support.dalux.com/hc/en-us/articles/8130293824028-Status-metadata-for-files
21. **Revision number shows the state**: minor numbers for shared, major numbers for published. Catenda. https://support.catenda.com/en/articles/9874698-user-guide-status-workflow-iso-19650
22. **Comments and resolutions stay linked to the register record.** Aconex, April 2026 (snippet only; page returned 403). https://www.oracle.com/news/announcement/new-oracle-aconex-capabilities-improve-project-transparency-and-control-2026-04-13/

**Adoption (the document drives work)**

23. **Requirements export as IDS and drive per-element pass/fail.** Each failure appears on the owning team's task and can be assigned on a Kanban board. Plannerly Verify (https://plannerly.com/use-cases/model-checking-ids/). BIMcollab Nexus + Zoom do the same (https://www.bimcollab.com/en/resources/blog/choosing-bim-software/).
24. **Naming standard enforced on upload; non-conforming files go to a Holding Area.** ACC (https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/File_Naming_Standard.html, search summary). Dalux also parses a compliant file name into metadata (https://www.dalux.com/en-gb/solutions/information-management/).
25. **Planned vs actual from CDE metadata**, with dashboards by discipline, originator and milestone. Morta (synced from ACC, Asite, Aconex and others) (https://www.morta.io/solutions/use-cases/information-delivery-planning). Asite makes the same claim.
26. **Live charts embedded in the document** (requirement completions: correct, incorrect, missing). Also a scheduled weekly PDF dashboard by email. Plannerly. https://plannerly.com/use-cases/model-checking-ids/
27. **One requirement source generating EIR tables, BEP tables, IFC mapping and checker rules.** BIMQ (search snippet only; vendor page 403). https://allplan.com/supporting-solutions/allplan-partner-details/intelligent-information-requirement-management-for-bim-projects

**Export**

28. **Formal PDF**: cover page, linked contents, team page, optional scope grid and timeline. Also a **combined EIR + BEP + MIDP hyperlinked package**. Plannerly. https://plannerly.com/use-cases/bep/
29. **Never lock data in.** The NBS BIM Toolkit web app was retired in 2022 and users were told to export to Excel. https://www.thenbs.com/knowledge/nbs-bim-toolkit-changes-in-2022

---

## 4. Sentinel today

All evidence is from the code read for this report (file list at the end). The panel is `docsPanel()` in `WebApp/src/setups/docs-panel.ts` (1386 lines, mounted as a sidebar tab at `src/main.ts:295`). All data goes through the bridge route `/bimdocs/*` (`bcf-service.mjs:2153-2259`).

### 4.1 Current state (screens)

- **List** (`showList`, docs-panel.ts:403). One flat row per document: type chip, title, status chip, `v{count}`. "+ New document" and "Ingest EIR/BEP" (`runIngest` :260, `showIngestReview` :282). No search, filter, grouping, owner/due column or progress.
- **Create** (`showCreate`, :460). A title input plus one button per template. No description, wizard, parent link or prefill.
- **Editor** (`showEditor`, :682). One collapsible `<details>` per section. Each has: guidance, a monospace `<textarea>` body, an owner email input, a section-state select, Save, Bindings, Draft with AI, a compliance chip strip (:484) and comments (:1078). The top bar has Document view, Versions, Suggest bindings, the AI picker and the transitions. Publish asks for its label with the in-page `askText` (F-LC-6 fix).
- **Bindings** (`showBindings` :532, `showSuggestBindings` :604). A per-section check picker. Suggestions come from a deterministic vocabulary (`binding-suggest.mjs`).
- **READINESS editor** (`showReadinessEditor`, :840). Three numbers per pillar, measured and declared items, owner and due per item, a derived "Closes when" plan, and markdown export.
- **Document view** (`showDocView`, :1155). A white page using `white-space:pre-wrap` (:1337-1338), Print/PDF via `window.open` + `print()` (:1360-1367), Check integrity, Strip test, Compile to IDS (EIR, :1181), and a naming candidate install (`findNamingCandidate`, :1196).
- **Versions** (`showVersions`, :1134). A list of versions. Click one to open its frozen snapshot.

**Templates** (`WebApp/bridge/templates/`): BEP "(post-appointment)" with 10 sections, EIR with 7, TIDP with 7, READINESS with 30 items. There is no MIDP, pre-appointment BEP, tender, appointment, protocol, risk-register or mobilisation template.

### 4.2 Data model

- **`bim_documents`** (migrations 0020, 0021): `id, project_id, doc_type` (open text), `title, status` (wip|shared|published|archived), `sections` jsonb, `created_by, created_at, updated_at`, `source` jsonb for ingested documents.
- **Section shape**: `{id, heading, guidance, body (plain text), state, owner (free-text email), bindings:{checks:[{id,params}]}}` (bimdocs-logic.mjs:20-40). READINESS adds `pillar, kind, question, answer_hint, answer, due`.
- **RLS** (0038): signed-in users cannot UPDATE. The bridge writes with the service key after `requireMinRole`, filtered on `updated_at`, so a lost race returns a 409 explained in words (bimdocs-store.mjs:18-31). Section edit needs contributor; transition, publish, bindings and plan need lead; comments need viewer.
- **`bim_document_versions`** (0020): full snapshot per version, append-only trigger. `publishDoc` (bimdocs-store.mjs:93) needs shared status and rolls back if the version insert fails. Going from published back to wip reuses the same row. There is no separate revision entity, no relabel and no diff.
- **Comments**: a `doc_comments` bag in `bridge_docs` with compare-and-set on `rev` and 4 retries (bimdocs-store.mjs:305-355). Append-only. No resolve, reply, mention or assignment.
- **Checks** (`check-registry.mjs` `CHECKS`, :429-570): 14 implemented. The count is from grepped id/label lines; the file was not read in full. Three are planned but not evaluated: `loin.levels`, `qa.scorecard`, `federation.breakdown` (:575-579). `office-checks.mjs` adds the `office.*` checks used by READINESS.
- **Executability** (`executability.mjs`): each section counts as controlling, declared or narrative. Score = controlling ÷ sections. **Readiness** (`readiness-logic.mjs`) shows three numbers per pillar and never blends them into one.
- **Deliverables** (0022, 0023, 0025): the MIDP is a `deliverables` table (`container_name, title, responsible_team, due_date, stage, notes, expected_revision, expected_suitability, purpose`). Status is derived from CDE files. `tidpReport` (deliverables-store.mjs:132) rolls the rows up by team. Writes are audited, including `rebaselined`.
- **Ledger**: every document write calls `audit()` (bimdocs-store.mjs:50, 78, 90, 111, 249, 276, 298, 339).
- **Templates** are read from disk by `loadTemplates()` (bimdocs-logic.mjs:12-17) and copied once at creation. A document does not record which template or template version it came from.

### 4.3 Strengths

- **Governance spine**: optimistic locking, role gates, append-only versions enforced by a database trigger, publish rollback, and a ledger row for every write (bimdocs-store.mjs:18-31, 93-112).
- **Honest executability**: only clauses bound to checks that Sentinel actually runs score, and readiness is never one blended percentage. Of the platforms researched, none was shown to separate "declared" from "controlling" clauses.
- **Documents wired to live project state**: bound clauses are judged against CDE, naming, MIDP and review-chain data (check-registry.mjs:429-570).
- **Adoption already exists**: the EIR compiles to IDS and installs as `ids@n`, and the naming candidate installs as `naming@n`. ACC and Dalux enforce naming from admin settings. Sentinel can enforce it from the document.
- **Grounded AI**: drafting uses numbered facts. Integrity findings that cite no fact are dropped in code (bimdocs-ai-logic.mjs). Cloud providers need `requireSpend`. Nothing is written without a human save.
- **Ingest of an existing EIR/BEP** returns a reviewable proposal and writes nothing until you commit it.
- **Comments sit outside the frozen document**, so reviewers can comment on a published version.
- **Deterministic binding suggestions** and **deterministic reports** (readiness markdown, weekly delivery report).
- **In-page `askText` / `askYesNo`** work inside the That Open sandbox (53d3d17d).

### 4.4 Gaps (with evidence)

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G1 | Fixed section list, plain-text bodies; no add, delete, rename or reorder of sections, no rich text, no tables | `patchSection` only changes body/owner/state (bimdocs-store.mjs:66-82); a different section list only via `createDocFromIngest` (:162); `<textarea>` (docs-panel.ts:~745); Snowdon roadmap "A BEP section cannot be added in the UI" | Blocker |
| G2 | No structured blocks: RACI, LOIN, milestones, software schedule, task-team list are all prose | Section shape (bimdocs-logic.mjs:20-40); `findNamingCandidate` hunts for a JSON fence (docs-panel.ts:1196); roadmap "BEP items A to G … PARTIAL" | Blocker |
| G3 | Thin document coverage: no pre-appointment BEP, MIDP document, protocol, risk register, mobilisation, capability/capacity summary | `templates/` holds only bep, eir, readiness, tidp; BEP titled "post-appointment"; P0 run "+ New document offers only BEP (post-appointment), EIR, READINESS, TIDP" | Blocker |
| G4 | MIDP is not a document; the TIDP document never reads or writes the deliverable rows | tidp-template.json is prose; `tidpReport` (deliverables-store.mjs:132) is a separate view (deliverables-panel.ts:103); roadmap gap #7 | Major |
| G5 | No links between documents or to an appointment/stage; project facts typed again | No parent/appointment/stage column (0020); BEP section 1 "Mirror the project record" not populated; the P0 run carried the BEP v1 → v2 by hand | Major |
| G6 | Review is a status machine only: no reviewers, rounds, approvals, resolve, mentions | `transitionDoc`/`publishDoc` need only `lead` (bimdocs-store.mjs:85, 94); comments have no status (:325-332) | Major |
| G7 | Versions: no diff, no "what changed", no relabel | `buildSnapshot` (bimdocs-logic.mjs:60-63); `listVersions`/`getVersion` (bimdocs-store.mjs:115-134); `showVersions` (docs-panel.ts:1134-1153); P0 v1 label stuck | Major |
| G8 | Export is browser print with raw markup; no .docx, cover, contents, revision table, appendices | docs-panel.ts:1337-1338, :1360-1367; F-LC-1 | Major |
| G9 | Fresh BEP/EIR ship unbound (BEP scores 0 %); LOIN, federation, QA checks are planned only | P0 run row 19; check-registry.mjs:575-579; template bindings only for READINESS (bimdocs-logic.mjs:34-38) | Major |
| G10 | Narrow docked sidebar, one flat view at a time, one `<details>` at a time, no outline/progress/search | docs-panel.ts:166, :403-458, :460-480, :727-808; main.ts:295 | Major |
| G11 | AI drafts one section at a time with a BEP-only prompt; integrity check on the local 7B model misreads | bimdocs-ai-logic.mjs `buildDraftPrompt`; F-LC-2; grounding cap 60 000 chars (bimdocs-ai.mjs:15) | Minor |
| G12 | Owner is free-text email; authorship cannot be transferred | `ownerIn` plain input (docs-panel.ts:~740); F-LC-4 | Minor |
| G13 | Templates are JSON on disk; documents keep no link to template or template version | bimdocs-logic.mjs:12-17; conflicts with the "No JSON or CLI for users" rule | Minor |
| G14 | Re-render loses scroll and open sections; Next strip not refreshing (F-LC-3) | `showEditor(doc.id)` after each save (docs-panel.ts:~770); F-LC-3 | Minor |

### 4.5 What to reuse

- **Governance core** in `bimdocs-store.mjs` (`writeDoc`/`patchSections`, role gates, 409s, `publishDoc` rollback, `audit()` with body_sha8). Extend it with add/remove/reorder section, relabel and blocks.
- **`bim_document_versions`** and its snapshots. A compare view needs no migration.
- **Checks** (`check-registry.mjs`, `validateBindings`, `setSectionBindings`, `binding-suggest.mjs`, `complianceReport`). Implement the three planned checks instead of building a second check system.
- **`executability.mjs`, `readiness-logic.mjs`, `office-checks.mjs`** as the workspace's quality side panel.
- **Deliverables** (`deliverables-store.mjs`, `deliverables-logic.mjs`: `validateRow`, `importDeliverables`, `deliverableStatus`, `tidpReport`, rebaseline, `weeklyReportMarkdown`) and `task-teams-store.mjs` as the data for MIDP/TIDP views.
- **EIR → IDS** (`eirToIds`, `installArtefact`) and the **naming install** (`findNamingCandidate`, `diffNaming`). These are the adoption steps.
- **AI gateway** (`bimdocs-ai*.mjs`, the cite-a-fact gate, `requireSpend`). Write prompts per doc_type.
- **Ingest** (`bimdocs-ingest.mjs`, `ingest-logic.mjs`).
- **Comments store** (rev CAS) and `commentThreadEl`. Add resolve and assign on top.
- **`ask.ts`**, `bfetch`, `activePid`/`onActiveProjectChange`, `myRoleRead`/`roleWords`, `esc()`, the members list (docs-panel.ts:891) and `requireMinRole`.
- **The no-JSON standard forms** as the pattern for template and section editors.

---

## 5. Gap assessment: Sentinel vs best practice

| Capability | Sentinel today | Best practice (from) | Severity | Proposal (one line) |
|---|---|---|---|---|
| Edit document structure | Fixed sections (G1) | Editable sections, Word import (Plannerly) | Blocker | Add store operations to add, remove, rename and reorder sections, each audited and locked like `patchSections`. |
| Tables and structured content | Prose only (G2) | Scope grid, linked RACI (Plannerly, Morta) | Blocker | Typed blocks inside a section (text, table, reference to live rows); naming becomes a table block instead of a JSON fence. |
| Document types | 4 templates, BEP post only (G3) | Full set incl. pre-/post-appointment BEP (Plannerly, CDBB) | Blocker | Add pre-appointment BEP, MIDP view, responsibility matrix, LOIN, protocol and risk register templates, in the order the founder picks. |
| MIDP/TIDP | Table + disconnected prose TIDP (G4) | TIDP = MIDP filtered by team (Plannerly, Morta, Asite) | Major | Make MIDP and TIDP documents live views of `deliverables` filtered by team; retire the TIDP prose template. |
| Shared project facts | Re-typed (G5) | SmartFields (Plannerly) | Major | Read the project record and appointed parties into a facts block every template references. |
| Document lineage | None (G5) | Pre → post BEP in one template (Plannerly); hierarchy with owners (CDBB) | Major | Add parent and stage to documents: BEP responds to EIR vN; post-appointment BEP confirms the pre-appointment one. |
| EIR requirement → BEP response | None | Not verified in any tool | Major | Optional: link each BEP section to the EIR clauses it answers, with a "not answered" list (no platform was shown to do this). |
| Review and acceptance | Status machine (G6) | Owners, suggestions, deadline, read tracking (Plannerly); ordered chain with outcomes (Catenda) | Major | Review round with named reviewers, a deadline and a recorded accept/reject per reviewer, written to the ledger. |
| Comments | Append-only, no resolve | Resolve, linked resolutions (Plannerly, Aconex) | Minor | Add resolved/assignee fields to the comment bag. |
| Sign-off | Lead clicks Publish | Per-team contract, e-sign (Plannerly) | Major | Recorded approval per appointed party on the version; e-signature only if the founder says it is needed. |
| Version diff | None (G7) | Version history (Plannerly; change list unverified) | Major | Section-by-section compare between two snapshots (no migration); allow a label edit stored beside the version. |
| Export | Browser print, raw markup (G8) | Cover, linked contents, combined EIR+BEP+MIDP package, Word/Excel (Plannerly) | Major | Render markup, add cover/contents/revision table, generate MIDP and team appendices from rows; .docx if required. |
| Requirements → checks | EIR → IDS works; LOIN prose, `loin.levels` planned (G9) | Scope grid → IDS → per-element pass/fail on the owning task (Plannerly, BIMcollab) | Major | LOIN as a table block (element, milestone, property, value) that compiles to IDS and implements `loin.levels`. |
| Out-of-box bindings | BEP/EIR unbound, score 0 % (G9) | Not observed elsewhere (Sentinel-specific) | Major | Ship templates with pre-bound sections, as READINESS already does. |
| Live status in document | Compliance chips per section | Embedded live charts, scheduled dashboard PDF (Plannerly) | Minor | Show planned vs actual from `deliverableStatus` inside the MIDP view; the weekly report already exists. |
| Workspace UX | Docked sidebar (G10) | Full-page workspace per module (Plannerly, Morta; unverified visually) | Major | Full-page view: outline on the left, editor centre, quality/review side panel right; keep scroll and open state. |
| Guidance and start | Title box + 4 buttons | Template + guidance + maturity entry points (CDBB); company library (Plannerly, Morta) | Major | Template picker with a description, "when to use", minimal/full variant and short guidance per section. |
| Templates in UI | JSON on disk (G13) | Company template library (Plannerly, Morta) | Minor | Save a published document as an office template through a form; record template id/version on each document. |
| Owners and people | Free-text email (G12) | Section owners from members (Plannerly) | Minor | Member picker from `members-store`; "my sections" view across documents. |
| AI | One section, BEP prompt, weak local model (G11) | Expand/correct, human edit before publish (Plannerly) | Minor | Prompts per doc_type; keep the cite-a-fact gate; integrity check only on a model that passes a fixed test set. |
| Code lists | Naming in JSON | Org-level picklists (Morta) | Minor | Use the installed naming ruleset's fields as picklists in deliverable and naming tables. |

---

## 6. Open questions for the founder (answer before a design is written)

1. **Who writes first in the first release?** Is it the appointing party writing an EIR, or a lead appointed party answering one with a pre-appointment BEP? This decides which document and which window is built first.
2. **Separate browser window or full-page view inside the app?** Must it work inside the published That Open app, where `prompt()`/`confirm()` were already found dead (F-LC-6)? Opening a second window from that sandbox was not tested.
3. **Pre- and post-appointment BEP**: one document that moves from tender to delivery (Plannerly), or two linked document types (CDBB)?
4. **MIDP/TIDP**: may the `deliverables` table become the only source, with the MIDP and TIDP documents as views of it, and the TIDP prose template retired?
5. **Sign-off strength**: is a recorded in-app approval per party (name, time, version hash, ledger row) enough, or do clients need a legal e-signature?
6. **Export**: is PDF enough, or must clients receive editable Word (.docx) and Excel? Must a Word file edited outside Sentinel come back in?
7. **LOIN depth**: full EN 17412-1 (geometry, alphanumeric and documentation per purpose and milestone), or a simpler element × milestone LOD/LOI grid like Plannerly Scope?
8. **First set of document types and their order**: which of pre-appointment BEP, MIDP view, responsibility matrix, LOIN, information protocol and risk register come in the first release?

---

## 7. Sources

**Platforms (external)**
- Plannerly: https://www.plannerly.com · https://www.plannerly.com/pricing · https://help.plannerly.com/en/article/68-how-to-create-a-master-information-delivery-plan-midp-in-plannerly · https://help.plannerly.com/en/article/132-iso-19650-specialist · https://plannerly.com/use-cases/midp/ · https://plannerly.com/use-cases/bep/ · https://plannerly.com/use-cases/model-checking-ids/ · https://plannerly.com/category/iso-19650-bim/
- CDBB / UK BIM Framework: https://www.cdbb.cam.ac.uk/AboutDBB/Promoting-digital-construction-Internationally/international-bim-toolkit · https://www.cdbb.cam.ac.uk/files/bim_toolkit_overview.pdf · https://globalbim.org/info-collection/iso-19650-templates-oir-pir-eir-air-bep-tidp-midp-responsibility-matrix-plus/ · https://www.designingbuildings.co.uk/wiki/Task_information_delivery_plan
- NBS: https://www.thenbs.com/knowledge/nbs-bim-toolkit-changes-in-2022 · https://www.designingbuildings.co.uk/wiki/Digital plan of work · https://www.designingbuildings.co.uk/wiki/NBS_Chorus
- Autodesk ACC (mostly search snippets; some pages returned 403): https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/File_Naming_Standard.html · https://www.autodesk.com/blogs/construction/driving-digital-standards-autodesk-construction-cloud-achieves-bsi-kitemark-certification-for-iso-19650/ · https://resources.imaginit.com/how-tos/acc-naming-standard-mandatory-vs-optional-fields · https://www.autodesk.com/integrations/partner/plannerly · https://www.autodesk.com/autodesk-university/class/Autodesk-Construction-Cloud-BIM-360-Template-Development-to-ISO-19650-Standards-and-More-2023 · https://construction.autodesk.eu/tools/construction-document-management-iso-19650 · https://www.autodesk.com/blogs/construction/autodesk-construction-support-iso-19650/ · https://itbrief.co.uk/story/autodesk-construction-cloud-receives-iso-19650-certification · https://autodesk.com/learn/ondemand/module/review-and-approve-documents-in-the-cloud-using-autodesk-docs · https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/Create_Transmittal_Files.html · https://aps.autodesk.com/node/3799
- BIMForum: https://bimforum.org/?p=442 · https://bimforum.org/wp-content/uploads/2024/12/LOD-Spec-2025-Part-I-Official.pdf
- Trimble Connect (snippets): https://shop.construsoft.com/products/document-workflow · https://www.capterra.co.uk/software/208909/trimble-connect · https://costbench.com/software/construction-management/trimble-connect/negotiation/ · https://www.trimble.com/fi/products/projectsight/document-management
- Procore (snippets): https://www.techrepublic.com/article/procore-review/ · https://eaglepoint.com/workflow/project-management-with-procore-procore-essentials · https://www.larksuite.com/en_us/blog/procore-review
- Catenda: https://support.catenda.com/en/articles/9874698-user-guide-status-workflow-iso-19650 · https://catenda.com/wp-content/uploads/2025/04/Guidebook-ISO-19-650.pdf · https://catenda.com/glossary/midp-master-information-delivery-plan · https://www.graphisoft.com/?p=137295
- Dalux: https://www.dalux.com/en-gb/solutions/information-management/ · https://support.dalux.com/hc/en-us/articles/8130293824028-Status-metadata-for-files · https://support.dalux.com/hc/en-us/articles/8005707150364-File-areas
- BIMcollab: https://www.bimcollab.com/pricing · https://helpcenter.bimcollab.com/portal/en/kb/articles/features-of-bimcollab-nexus-plans · https://www.bimcollab.com/en/resources/blog/choosing-bim-software/
- Bimplus: https://www.bimplus.net/us_en/pricing · https://www.allplan.com/fileadmin/user_upload/shared-files/products/bimplus/pdfs/Allplan_Bimplus_Pricing_List_EN_UK.pdf · https://us.fitgap.com/products/allplan-bimplus
- BIMQ (snippets; pages 403): https://allplan.com/supporting-solutions/allplan-partner-details/intelligent-information-requirement-management-for-bim-projects · https://blog.allplan.com/en/bimq
- Thinkproject: https://www.thinkproject.com/insights/blog/iso-19650-bim/
- Zutec: https://zutec.com/solutions/operations-and-maintenance-manuals · https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/198026744339215 · https://datadrivenaec.com/tools/dfm-systems
- Morta: https://www.morta.io/solutions/use-cases/information-delivery-planning · https://www.morta.io/solutions/information-management · https://www.morta.io/solutions/use-cases/information-standards · https://www.morta.io/pricing
- usBIM: https://extranetevolution.com/2018/12/a-first-look-at-accas-usbim-cde/ · https://bimcorner.com/?p=45818 · https://www.environmental-expert.com/software/usbimplatform-bim-collaboration-platform-710824
- IDS tooling: https://bimcorner.com/?p=45818 · https://bricscad.octave.com/blog/bridging-the-gap-between-lod-loi-and-the-buildingsmart-ids-with-bricscad-bim · Solibri help centre (snippet, 403) · ids.bimvision.eu (snippet, certificate error)
- Asite: https://www.asite.com/blogs/how-asite-playbook-turns-iso-19650-into-a-practical-delivery-engine · https://www.asite.com/news/asite-achieves-bsi-kitemark-for-bim-software · https://capterra.com/p/132369/Adoddle/ · https://www.asite.com/blogs/how-to-choose-a-common-data-environment-for-bim-teams
- Oracle Aconex: https://www.oracle.com/construction-engineering/aconex/ · https://docs.oracle.com/en/industries/construction-engineering/intelligence/subject-area-reference-guide/aconex-documents.html · https://docs.oracle.com/cd/E97085_01/TPMhelp/en/Europe/10314970.htm · https://www.oracle.com/news/announcement/new-oracle-aconex-capabilities-improve-project-transparency-and-control-2026-04-13/
- Newforma: https://www.newforma.com/iso-19650-what-newforma-brings-to-you · https://www.g2.com/compare/autodesk-forma-formerly-autodesk-construction-cloud-vs-newforma-konekt
- Bentley ProjectWise: https://architosh.com/2020/06/bentleys-projectwise-365-has-gone-saas-brings-broad-market-and-platform-appeal-to-aeco-industry/2 · https://www.transport.nsw.gov.au/system/files/media/documents/2023/Establishing-the-Contractor-CDE-v4.1.pdf · https://eaglepoint.com/course-library/learning-path/adopting-iso-19650-in-projectwise-bentley-infrastructure-cloud-streamlined-data-management-for-digital-projects-infrastructure-cloud-portal/
- Bimspot: nothing found.

**Sentinel (internal, read for section 4)**
- `WebApp/src/setups/docs-panel.ts`; `WebApp/src/main.ts` (285-300)
- `WebApp/bridge/bimdocs-store.mjs`, `bimdocs-logic.mjs`, `bimdocs-ai.mjs` (1-60), `bimdocs-ai-logic.mjs` (1-70), `bimdocs-ingest.mjs` (1-50)
- `WebApp/bridge/templates/bep-template.json`, `eir-template.json`, `readiness-template.json`, `tidp-template.json`
- `WebApp/bridge/executability.mjs`, `check-registry.mjs` (grep only), `office-checks.mjs` (grep only), `readiness-logic.mjs` (1-80), `binding-suggest.mjs` (1-45), `deliverables-store.mjs`, `bcf-service.mjs` (/bimdocs block, grep only)
- `WebApp/db/migrations/0020_bim_documents.sql`, `0021_bim_documents_source.sql`, `0022_deliverables.sql` (head), `0038_bridge_role_rules.sql` (grep)
- `docs/testing/snowdon-lifecycle/P0/P0-RUN_2026-10-22.md` (F-LC findings, lines 93-120)
- `docs/testing/SNOWDON_LIFECYCLE_ROADMAP_DRAFT_2026-10.md` (P0 section and gap table, lines 61-106, 380-392)
