# Office readiness assessment

Generated 2026-09-21T23:24:00.527Z.

## Evidence basis

- Office snapshot: AST_Template taken 2026-09-21, received 2026-09-21.
- Model scan: AST_ASTR26_Aster Tower scanned 2026-09-21.

## Overall

- Measured: 3 met · 8 violation · 2 not checkable
- Declared: 0 yes · 9 partial · 8 no
- Missing: 0

## Standards

- Measured: 2 met · 4 violation · 1 not checkable
- Declared: 0 yes · 2 partial · 1 no
- Missing: 0

| Item | Kind | Verdict | Reason / evidence |
|---|---|---|---|
| 1. Office snapshot received | measured | met | Snapshot of AST_Template taken 2026-09-21: 1239 types, 0 worksets, 1 shared parameters. |
| 2. Naming rules exist for families, types, views and sheets | measured | met | Rules for family, type, view, sheet present; office code BDS. |
| 3. Template types follow the type convention | measured | violation | 0 of 115 governed types (0 %) match the type convention; threshold 90 %. — Ceilings: Generic; Ceilings: 2' x 2' ACT System; Ceilings: 2' x 4' ACT System; Ceilings: 5/8" GWB on Metal Stud; Ceilings: 5/8" GWB on Wood Furring |
| 4. Worksets follow the office whitelist | measured | not checkable | Revit templates (.rte) cannot carry worksets — send the office snapshot from a workshared starter model to measure this; a live model's workset names are also judged by the scan (office.model_health, rule WS-01). |
| 5. Required shared parameters exist | measured | violation | 1 required shared parameter(s) missing from the template. — missing: BDS_View Status |
| 6. Live model health | measured | violation | AST_ASTR26_Aster Tower, scanned 2026-09-21: 0 block, 103 warn across 320 elements (limits: 0 block, ≤ 25 warn). — WS-01: 18 warn; VN-01: 54 request; VP-01: 54 warn; SN-01: 25 request; FN-01: 30 warn |
| 7. Container naming standard installed | measured | violation | No standards pack is selected for this project. — standards_pack: not set |
| 8. Family library has a custodian and a location | declared | no | not yet |
| 9. Revit template is versioned and owned | declared | partial | not all of them |
| 10. Office modelling guideline exists | declared | partial | outdated |

## People

- Measured: 1 met · 1 violation · 0 not checkable
- Declared: 0 yes · 3 partial · 3 no
- Missing: 0

| Item | Kind | Verdict | Reason / evidence |
|---|---|---|---|
| 11. Project roles present: owner and lead | measured | met | Owner and lead present (4 members). |
| 12. Task teams declared per discipline, each with a lead | measured | violation | No task teams declared. — task teams: none |
| 13. A BIM manager is named and accountable | declared | no | .. |
| 14. Coordinators named per discipline | declared | partial | ... |
| 15. Modellers trained on the template | declared | partial | .......... |
| 16. Onboarding for new staff exists | declared | no | ......... |
| 17. Time is budgeted for information management | declared | partial | ........ |
| 18. Responsibility matrix agreed with clients | declared | no | ........ |

## Process

- Measured: 0 met · 3 violation · 1 not checkable
- Declared: 0 yes · 4 partial · 4 no
- Missing: 0

| Item | Kind | Verdict | Reason / evidence |
|---|---|---|---|
| 19. A BEP exists and is executable | measured | violation | “inherited-bep” executability 0 % (threshold 50 %). — inherited-bep: 0 % |
| 20. CDE states in use | measured | violation | 1 of 1 container(s) are not published. — AST_ASTR26_Aster Tower.ifc: state is wip, expected published |
| 21. Container names conform | measured | violation | 1 of 1 container name(s) fail the bridge default ruleset (“BDS ISO 19650 container naming (V1.4, 11-field)”). — AST_ASTR26_Aster Tower.ifc: *: expected 11 '-'-separated fields (Project-Originator-Document Type-Sub-Type-Discipline-Zone-Venue-Level-Number-Suitability-Revision), got 1 |
| 22. Task-team responsibility on deliverables | measured | not checkable | No deliverables are defined for this project yet, so there is no production to assign to a task team. |
| 23. Reviews happen before Shared | declared | no | ....... |
| 24. Authorisation before Published is separate from submission | declared | no | ......... |
| 25. EIR received and read for current projects | declared | partial | ........... |
| 26. MIDP maintained against the programme | declared | partial | ........... |
| 27. Issues tracked in one place | declared | partial | ...... |
| 28. Models exchanged as IFC with a delivery gate | declared | no | ......... |
| 29. Handover deliverables defined | declared | partial | ... |
| 30. Lessons learned recorded per project | declared | no | .... |

## Plan

| Item | Owner | Due | Status | Closes when |
|---|---|---|---|---|
| 3. Template types follow the type convention | — | — | open | check office.template_types reports met |
| 4. Worksets follow the office whitelist | — | — | open | check office.worksets reports met |
| 5. Required shared parameters exist | — | — | open | check office.shared_params reports met |
| 6. Live model health | — | — | open | check office.model_health reports met |
| 7. Container naming standard installed | — | — | open | check office.naming_standard reports met |
| 11. Project roles present: owner and lead | yazanhijazeen32@hotmail.com | 2026-10-08 | closed | check office.roles reports met |
| 12. Task teams declared per discipline, each with a lead | yazanhijazeen32@hotmail.com | 2026-09-30 | open | check office.task_teams reports met |
| 19. A BEP exists and is executable | — | — | open | check office.bep reports met |
| 20. CDE states in use | yazanhijazeen32@hotmail.com | 2026-10-07 | open | check cde.states reports met |
| 21. Container names conform | user3@gmail.com | 2026-10-01 | open | check naming.containers reports met |
| 22. Task-team responsibility on deliverables | user3@gmail.com | 2026-09-30 | open | check roles.responsibility reports met |
| 8. Family library has a custodian and a location | — | — | open | answer becomes yes |
| 9. Revit template is versioned and owned | — | — | open | answer becomes yes |
| 10. Office modelling guideline exists | — | — | open | answer becomes yes |
| 13. A BIM manager is named and accountable | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 14. Coordinators named per discipline | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 15. Modellers trained on the template | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 16. Onboarding for new staff exists | yazanhijazeen32@hotmail.com | 2026-09-30 | open | answer becomes yes |
| 17. Time is budgeted for information management | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 18. Responsibility matrix agreed with clients | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 23. Reviews happen before Shared | yazanhijazeen32@gmail.com | 2026-09-30 | open | answer becomes yes |
| 24. Authorisation before Published is separate from submission | user3@gmail.com | 2026-10-08 | open | answer becomes yes |
| 25. EIR received and read for current projects | yazanhijazeen32@hotmail.com | 2026-10-08 | open | answer becomes yes |
| 26. MIDP maintained against the programme | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 27. Issues tracked in one place | yazanhijazeen32@hotmail.com | 2026-10-08 | open | answer becomes yes |
| 28. Models exchanged as IFC with a delivery gate | yazanhijazeen32@hotmail.com | 2026-10-01 | open | answer becomes yes |
| 29. Handover deliverables defined | user4@gmail.com | 2026-10-01 | open | answer becomes yes |
| 30. Lessons learned recorded per project | user3@gmail.com | 2026-09-30 | open | answer becomes yes |
