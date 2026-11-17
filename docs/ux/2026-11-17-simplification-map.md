# Sentinel simplification map (proposal, 2026-11-17)

Status: **proposal, nothing built.** Source inventories: `2026-11-17-inventory-web.md` (partial: some panels not walked)
and `2026-11-17-inventory-revit.md`. Interface language: English only.

## Where we are

| | Today | Target |
|---|---|---|
| Web top-level areas | 14 (33 screens) | 5 |
| Web rows showing internal jargon | 149 of 294 | 0 outside Settings ▸ Advanced |
| Revit ribbon buttons | 44 in 4 panels | 6 visible + "More" |
| Revit buttons showing jargon | 20 of 44 | 0 |
| Revit windows | 27 + 1 pane | pane is the home; windows open from it |

## Rules

1. Every screen answers one question for one role (BIM manager, modeller, reviewer).
2. No internal words on screen. Glossary below. Codes, hashes, `@n` versions, JSON: only in a collapsed "Details".
3. Defaults first: a new project starts from an office template with standards already installed.
4. Role hides what isn't yours. Advanced tools live under "More" / Settings ▸ Advanced, never deleted.
5. The engine stays the same. This is a rename, regroup and hide job. No new features.

## Web: 14 areas → 5

| New area | Question it answers | Absorbs (today's areas) |
|---|---|---|
| **Home** | What needs me now? | Dashboard (Command Center), Guide/Copilot, Ask Sentinel, Holding area, Platform deliveries |
| **Models** | What does the model look like, and is it right? | Viewer, BIM Tools (Browser, Properties, Visibility, Views, Sheets), Clash, QA, Inspect/measure/clip, Performance (→ Advanced) |
| **Documents** | What's agreed and delivered? | Project Files, Documents (BEP/EIR/Readiness), Deliverables (MIDP/TIDP), CDE containers, Review desk |
| **Issues** | What's wrong and who fixes it? | Issues (BCF), RFIs, clash groups sent as issues |
| **Settings** | How is this project set up? | Project Settings, Standards marketplace, people/access; **Advanced**: Data feed, Lifecycle 4D–7D, Tender, Owner portal, ledger verification |

Lifecycle 4D–7D, Tender and Owner are real value but not daily work: they become **Reports** inside Documents
once a project reaches that stage (shown only when the stage is reached).

## Revit: 44 buttons → 6

| Button | Opens | Replaces |
|---|---|---|
| **Sentinel** (pane) | Home: next step, status, sign-in state | Show Panel, Health Scorecard, Sign in |
| **Check** | Scan Now with results grouped by fix | Scan Now, Rule Set, IFC Pre-Flight, MEP Type Check, Naming Manager, Family Health |
| **Fix** | Proposed changes to approve, with undo | Change Requests, Review AI Proposals, Applied AI Changes, MEP Openings, Heal Families |
| **Issues** | Issues + clashes in one list | BCF Issues, Clash Manager, Clash Register |
| **Publish** | One publish button, pre-publish check inside | Governed Publish, IFC Delivery Gate, Publish Sheets, Publish Views |
| **More** | Setup and standards (BIM manager) | Project Setup, PC Settings, Build Office System, Apply Standard, Ingest Docs, Modelling Guideline, IFC Export Mapping, Review Flag |

## Glossary (on-screen words)

| Internal | On screen |
|---|---|
| changeset | Proposed changes |
| apply / revert changeset | Apply / Undo |
| ledger | History |
| ledger row #n | (hidden; "View history") |
| gate / delivery gate | Pre-publish check |
| ruleset@n, contract@n, artefact | Project standards (version in Details) |
| governed publish | Publish |
| holding area | Waiting for approval |
| IDS | Data requirements |
| MIDP / TIDP | Delivery plan |
| CDE container | Folder / Shared / Published (ISO state as a badge) |
| sha / hash | (hidden; "Verified" badge) |
| bridge / token | (hidden; "Connected" dot) |
| BCF | Issue (BCF only on import/export buttons) |

## Next steps

1. Founder picks / edits this map.
2. Clickable mock of the 5 web areas and the 6-button Revit pane (images, no code).
3. After Snowdon P3: build the modeller journey first (Check → Fix → Publish), test it on someone new against ACC (time, clicks).
