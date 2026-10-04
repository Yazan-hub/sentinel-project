# Office readiness assessment

Generated 2026-09-22T03:53:06.413Z.

## Evidence basis

- Office snapshot: AST_Template taken 2026-09-22, received 2026-09-22.
- Model scan: AST_ASTR26_Aster Tower_yazan.hKNTHU scanned 2026-09-22.

## Overall

- Measured: 8 met · 3 violation · 2 not checkable
- Declared: 0 yes · 9 partial · 8 no
- Missing: 0

## Standards

- Measured: 5 met · 1 violation · 1 not checkable
- Declared: 0 yes · 2 partial · 1 no
- Missing: 0

| Item | Kind | Verdict | Reason / evidence |
|---|---|---|---|
| 1. Office snapshot received | measured | met | Snapshot of AST_Template taken 2026-09-22: 1239 types, 0 worksets, 1 shared parameters. |
| 2. Naming rules exist for families, types, views and sheets | measured | met | Rules for family, type, view, sheet present; office code AST. |
| 3. Template types follow the type convention | measured | met | 109 of 115 governed types (95 %) match the type convention; threshold 90 %. |
| 4. Worksets follow the office whitelist | measured | not checkable | Revit templates (.rte) cannot carry worksets — send the office snapshot from a workshared starter model to measure this; a live model's workset names are also judged by the scan (office.model_health, rule WS-01). |
| 5. Required shared parameters exist | measured | met | All 1 required shared parameter(s) present. |
| 6. Live model health | measured | violation | AST_ASTR26_Aster Tower_yazan.hKNTHU, scanned 2026-09-22: 0 block, 85 warn across 321 elements (limits: 0 block, ≤ 25 warn). — WS-01: 1 warn; VN-01: 54 request; VP-01: 54 warn; SN-01: 25 request; FN-01: 30 warn |
| 7. Container naming standard installed | measured | met | Standards pack: ast-std-001@1.0.0. |
| 8. Family library has a custodian and a location | declared | no | not yet |
| 9. Revit template is versioned and owned | declared | partial | not all of them |
| 10. Office modelling guideline exists | declared | partial | outdated |

## People

- Measured: 2 met · 0 violation · 0 not checkable
- Declared: 0 yes · 3 partial · 3 no
- Missing: 0

| Item | Kind | Verdict | Reason / evidence |
|---|---|---|---|
| 11. Project roles present: owner and lead | measured | met | Owner and lead present (4 members). |
| 12. Task teams declared per discipline, each with a lead | measured | met | 3 team(s) across 0 discipline(s), all with a lead. |
| 13. A BIM manager is named and accountable | declared | no | .. |
| 14. Coordinators named per discipline | declared | partial | ... |
| 15. Modellers trained on the template | declared | partial | .......... |
| 16. Onboarding for new staff exists | declared | no | ......... |
| 17. Time is budgeted for information management | declared | partial | ........ |
| 18. Responsibility matrix agreed with clients | declared | no | ........ |

## Process

- Measured: 1 met · 2 violation · 1 not checkable
- Declared: 0 yes · 4 partial · 4 no
- Missing: 0

| Item | Kind | Verdict | Reason / evidence |
|---|---|---|---|
| 19. A BEP exists and is executable | measured | met | “BIM Execution Plan (post-appointment)” executability 50 % (threshold 50 %). |
| 20. CDE states in use | measured | violation | 4 of 4 container(s) are not published. — AST_Template.ifc: state is wip, expected published; AST_ASTR26_Aster Tower_yazan.ifc: state is wip, expected published; AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc: state is wip, expected published; AST_ASTR26_Aster Tower.ifc: state is wip, expected published |
| 21. Container names conform | measured | violation | 4 of 4 container name(s) fail the project's ruleset (“Aster Studio container naming (AST-STD-001, 7-field)”). — AST_Template.ifc: *: expected 7 '-'-separated fields (Project-Originator-Volume-Level-Type-Role-Number), got 1; AST_ASTR26_Aster Tower_yazan.ifc: *: expected 7 '-'-separated fields (Project-Originator-Volume-Level-Type-Role-Number), got 1; AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc: *: expected 7 '-'-separated fields (Project-Originator-Volume-Level-Type-Role-Number), got 1; AST_ASTR26_Aster Tower.ifc: *: expected 7 '-'-separated fields (Project-Originator-Volume-Level-Type-Role-Number), got 1 |
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
| 4. Worksets follow the office whitelist | — | — | open | check office.worksets becomes checkable, then reports met — Revit templates (.rte) cannot carry worksets — send the office snapshot from a workshared starter model to measure this; a live model's workset names are also judged by the scan (office.model_health, rule WS-01). |
| 6. Live model health | — | — | open | check office.model_health reports met |
| 11. Project roles present: owner and lead | <the founder's account> | 2026-10-08 | closed | check office.roles reports met |
| 12. Task teams declared per discipline, each with a lead | <the founder's account> | 2026-09-30 | closed | check office.task_teams reports met |
| 20. CDE states in use | <the founder's account> | 2026-10-07 | open | check cde.states reports met |
| 21. Container names conform | <the founder's second account> | 2026-10-01 | open | check naming.containers reports met |
| 22. Task-team responsibility on deliverables | <the founder's second account> | 2026-09-30 | open | check roles.responsibility becomes checkable, then reports met — No deliverables are defined for this project yet, so there is no production to assign to a task team. |
| 8. Family library has a custodian and a location | — | — | open | answer becomes yes |
| 9. Revit template is versioned and owned | — | — | open | answer becomes yes |
| 10. Office modelling guideline exists | — | — | open | answer becomes yes |
| 13. A BIM manager is named and accountable | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 14. Coordinators named per discipline | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 15. Modellers trained on the template | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 16. Onboarding for new staff exists | <the founder's account> | 2026-09-30 | open | answer becomes yes |
| 17. Time is budgeted for information management | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 18. Responsibility matrix agreed with clients | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 23. Reviews happen before Shared | <the founder's second account> | 2026-09-30 | open | answer becomes yes |
| 24. Authorisation before Published is separate from submission | <the founder's second account> | 2026-10-08 | open | answer becomes yes |
| 25. EIR received and read for current projects | <the founder's account> | 2026-10-08 | open | answer becomes yes |
| 26. MIDP maintained against the programme | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 27. Issues tracked in one place | <the founder's account> | 2026-10-08 | open | answer becomes yes |
| 28. Models exchanged as IFC with a delivery gate | <the founder's account> | 2026-10-01 | open | answer becomes yes |
| 29. Handover deliverables defined | <the founder's second account> | 2026-10-01 | open | answer becomes yes |
| 30. Lessons learned recorded per project | <the founder's second account> | 2026-09-30 | open | answer becomes yes |
