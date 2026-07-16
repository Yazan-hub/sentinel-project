# 4D BIM Construction Sequencing Software — Market Analysis

*Prepared 2026-07-16 to inform Sentinel's browser-based BIM governance + PM platform (That Open / fragments + web-ifc). Every non-obvious claim is cited inline. Figures from resellers/aggregators or single sources are flagged. "4D" is used loosely across this market — this report separates **schedule-driven planning 4D** (Synchro, Navisworks, Bexel, ALICE) from **progress-monitoring 4D** (Cintoo, Buildots) and **4D-labeled viewers** (Revizto).*

---

## 1. Executive Summary

The 4D BIM market is dominated by two mature, **desktop-bound** authoring tools — **Bentley SYNCHRO 4D** and **Autodesk Navisworks TimeLiner** — plus model-based estimating suites (Bexel, RIB iTWO), scheduler-integrated 4D (Asta Powerproject), and a thin, immature layer of genuinely browser-native 4D (VisiLean, Bexel Viewer, Trimble Connect Planner). Leaders are single-user, heavy-install, GPU-hungry, and expensive, concentrating 4D into one specialist seat per project. Most 4D is produced **once for a tender as a non-interactive animation and then abandoned** — confirmed empirically ([Frontiers 2022](https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2022.998309/full)).

The deepest, best-evidenced pain point is **fragile schedule↔model linkage**: links break whenever the model is revised or the schedule re-baselined, forcing manual re-linking. A peer-reviewed case study measured initial linking at **2–3 full working days per project** ([Frontiers 2022](https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2022.998309/full)); practitioners resort to homegrown GUID/MS-Access middleware to keep links alive ([AUGI](https://forums.augi.com/archive/index.php/f-924-p-2.html)). This is the keystone problem — solving it also unlocks live progress tracking.

Critically for a web platform: **the browser 4D lane is genuinely open.** Speckle publicly stated it does not target 4D ([Speckle](https://speckle.community/t/4d-bim-model-web-viewer/5926)); Autodesk's cloud (ACC/Build) has **no native 4D** and users are formally requesting it ([ACC Ideas](https://forums.autodesk.com/t5/acc-ideas/acc-build-connecting-schedule-and-model/idi-p/13319757)); lean/takt/location-based methods are structurally underserved by Gantt-centric incumbents. The That Open stack already ships the load-bearing primitives — Highlighter (per-element color/opacity), Hider (per-element visibility), web-ifc (parses `IfcTask`/`IfcWorkSchedule`/`IfcRelSequence`), and BCFTopics.

### Top 5 opportunities (ranked by impact × feasibility)

1. **Durable, identity-tolerant schedule↔model linking that survives revisions.** #1 pain across every tool. Reuse the QA/rule engine to auto-map tasks↔elements by classification/property and re-heal links on change. *(High impact, med-high feasibility.)*
2. **Browser-native, zero-install, multiplayer 4D.** Incumbents are desktop-core with cloud bolt-ons. No one offers real-time multiplayer 4D on the 3D model. *(High impact, high feasibility.)*
3. **Integrated 4D tied to existing 5D cost, 6D carbon, BCF, RFIs, progress — one model.** Scrub the timeline; watch cash-flow and carbon-over-time move; drop a BCF issue on an out-of-sequence element. No incumbent owns this connective layer, and Sentinel already has the other dimensions. *(High impact, high feasibility.)*
4. **openBIM-native 4D output (IFC 4.3 `IfcWorkSchedule` + BCF).** Almost no tool round-trips 4D as open data. *(Med-high impact, medium feasibility.)*
5. **Model-native takt / location-based sequencing.** Sequence by zones on the model, serving lean/takt teams Gantt-first 4D can't. *(High impact, medium feasibility.)*

---

## 2. Tool-by-Tool Assessment

| Tool | Platform | 4D authoring | Task↔element linking | IFC / interop | Collaboration | Pricing (indicative) |
|---|---|---|---|---|---|---|
| **SYNCHRO 4D** (Bentley) | Desktop authoring (Win); web/mobile view+control | Yes — market-leading | Objects→**Resources**→Tasks; **Auto-Matching** (Exact/Substring/LCS) | Imports IFC/RVT/NWC/DGN; **IFC import loses grouping**; fidelity locked in `.sp/.spx` | Control (web) + iTwin; authoring single-user desktop | ~€4,375/user/yr; Control ~€1,313; Field ~€394 |
| **Navisworks TimeLiner** (Autodesk) | Desktop only | Yes — mature | Manual + **rules via Search/Selection Sets** (exact name match) | IFC via NWC; **no real IFC export**; closed `.nwd` | None native; cloud added 2025 | Via AEC Collection ~US$3,675–3,795/yr |
| **Autodesk Construction Cloud / Build** | Web/cloud | **No true 4D** | Reference-linking only (no timeline animation) | Hosts IFC/Revit/NWD | **Strong** CDE | Per-user quote |
| **Bexel Manager** | Desktop authoring + web review | Yes (desktop) | **Rule/query auto-linking** — strongest; quantity-driven | openBIM; native IFC + BCF | Bexel CDE | Manager €2,400/$2,800; cloud €90–240 |
| **Vico Office** (Trimble) | Desktop | LBS/takt/flowline | Manual + location-based | IFC import | File-based | **EOL — discontinued 30 Jun 2024** |
| **Trimble Connect** | Cloud CDE + web/mobile | Partial — **Planner** ext (Nordics-gated) | Manual + install-rate dating + rules | TrimBIM, IFC | **Strong** web/mobile CDE | Free tier + quote |
| **Fuzor** (Kalloc) | Desktop (GPU-heavy) + VR | Yes + real-time VR | Task links + bidirectional **Live Link** | Via Revit/ARCHICAD/Navisworks | Multi-user VR | ~$140–$1,350/mo |
| **Asta Powerproject BIM** (Elecosoft) | Desktop | Yes — **4D in the scheduler** | Drag objects↔Gantt; **generate tasks from IFC** | **Native IFC 2x3+IFC4** | Free viewer + videos | ~£880–$2,000/yr + 4D add-on |
| **Primavera P6** (Oracle) | Desktop + web | **None** — CPM only | N/A | XER/XML/CSV | Web (schedule only) | Oracle enterprise |
| **RIB iTWO** | Desktop + cloud ERP | Yes (5D ERP) | **Quantity/IFC-driven** | IFC + proprietary **CPIXML** | Enterprise cloud | Enterprise |
| **VisiLean** | **Cloud/browser** | **Yes — live 4D** | Element→task, Lean/Last-Planner/Takt | Forge/BIM 360/ACC | Cloud + mobile | Quote |
| **ALICE Technologies** | Cloud | **Generative** 4D from model | Rule/constraint ("recipes") | Model import | Enterprise | ~$50K–150K/yr (est.) |
| **Aphex** | Browser | **No model 4D** (schedule only) | N/A — multiplayer programme | P6/Asta import | **Strong** multiplayer | From £35/user/mo |
| **Revizto / Dalux / StreamBIM / Cintoo** | Cloud/web viewers | "4D" labels ≠ scheduling engine | Coordination / progress-monitoring | IFC viewers | Strong CDE/field | Quote |

**Most consequential findings:**
- **Autodesk's cloud 4D is a genuine gap** — real 4D authoring still needs desktop Navisworks; ACC Schedule links only *references*, no 3D scrubber ([ACC Ideas](https://forums.autodesk.com/t5/acc-ideas/acc-build-connecting-schedule-and-model/idi-p/13319757)).
- **Navisworks pain:** no native web viewer ([Autodesk](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Autodesk-Navisworks-models-on-the-cloud.html)); appearance-config crash bug ([KB](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Navisworks-crashes-when-changing-model-appearance-in-Timeliner.html)); links vanish on refresh; no IFC export.
- **Asta** = most IFC-native, only tool unifying scheduler+4D in one app — but Windows-only ([Elecosoft](https://elecosoft.com/us/products/asta/asta-powerproject-4d/)).
- **Bexel** = strongest auto-linking, transparent pricing, but 4D authoring desktop-only ([Bexel](https://help.bexelmanager.com/docs/help-center/bexel-manager/smart-4d-and-5d-bim-management/)).
- **P6 = scheduling source, not 4D** ([Ten Six](https://tensix.com/timescaled-logic-diagrams-in-p6-visualizer/)). **Vico Office is dead** (Trimble EOL 30 Jun 2024).

---

## 3. SYNCHRO 4D Deep-Dive (primary reference)

Bentley acquired Synchro (2018); now sold "powered by iTwin" ([Bentley](https://www.bentley.com/software/synchro/)).

**How it operates.** Import 3D/federated model (58+ formats; Revit/Navisworks plug-ins export native geometry to SPX) → import/link schedule (bi-directional **P6, MS Project, Asta**, Excel; or author CPM) → link tasks to elements → simulate ([Aufiero](https://bentley.aufieroinformatica.com/en/synchro-eng/)). Distinctive: **a 3D object cannot link directly to a task** — it must belong to a **Resource**, and the Resource is assigned to the task, forcing schedule completeness ([CafeBIM](https://medium.com/cafebim/auto-matching-rules-in-synchro-c2bc4dd11329)).

**Visualization / UX.** Synchronized **Gantt + 3D** with a moving "Focused Time" marker. **Appearance ("Use") Profiles** control look before/during/after a task via color/transparency/visibility with five actions — **Install, Maintain, Neutral, Remove, Temporary** — and one resource can carry different profiles across tasks (flexibility Navisworks lacks). Simulates **temporary works + equipment** (cranes, scaffolding) with assignable **3D motion paths** ([Bentley KB0017454](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0017454)). *Caveat:* dated desktop UI; animation paths need mm-precision editing.

**Linking.** Manual or **Auto-Matching** — rules matching common strings via **Exact / Substring / LCS** with AND/OR ([StudyLib](https://studylib.net/doc/28047532/synchro-construction-solution---auto-matching---communities)). *Fragility:* User Fields must be created in the *scheduler* to survive round-trips; Revit param changes require re-sync; renamed values silently break matches; no property-based search sets.

**IFC / interop.** Imports+exports IFC ([bimsdks](https://www.bimsdks.com/bentley/Synchro/importing_ifc_information.htm)) but **IFC import loses element grouping** ("no grouping of elements of the same type… challenging to utilise for simulation") ([ResearchGate](https://www.researchgate.net/figure/Different-exchange-formats-and-their-model-elements-in-Synchro-4D-a-DWFx-b-FBX-c_fig7_375925511)), pushing users to proprietary RVT→SPX (lock-in).

**Desktop vs web.** Authoring = installed Windows app. Web/mobile — **Control** (upload SP, play 4D in-browser), **Perform**, **Field** — handle viewing/controls, not authoring.

**Praise (Capterra 4.7/5):** best-in-class visualization; pre-construction rehearsal; CPM editing simpler than P6. **Complaints:** steep learning curve; high cost; demands dedicated GPU (16–64 GB RAM); data-sync frustration; IFC import issues; dated UI ([Capterra](https://www.capterra.com/p/35289/Synchro/reviews/); [system reqs](https://communities.bentley.com/products/construction/w/construction__wiki/48019/synchro-4d-pro---system-and-hardware-requirements)).

---

## 4. Cross-Cutting Problems (ranked by evidence strength)

1. **Fragile schedule↔model sync (strongest).** Navisworks links "disappear" on model refresh ([Autodesk](https://forums.autodesk.com/t5/navisworks-forum/timeliner-linking-task-id-with-object-id/td-p/5607105)); root cause architectural — model and schedule authored separately with no durable key ([Frontiers 2022](https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2022.998309/full)). Homegrown GUID/Access middleware is the tell.
2. **Tedious manual linking (quantified).** "Most time-consuming activity… linking" — **2–3 working days** ([Frontiers 2022](https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2022.998309/full)); auto-linking degrades to manual on messy federated models ([MDPI](https://www.mdpi.com/2075-5309/12/8/1145)).
3. **Desktop-bound, no live multi-user.** Navisworks "no native web-based viewer equivalent" ([Autodesk](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Autodesk-Navisworks-models-on-the-cloud.html)); cloud added June 2025 ([Nziza](https://nzizaglobal.com/blog/navisworks-manage-to-include-powerful-cloud-collaboration)).
4. **Steep curve / "4D theatre".** 4D "mainly restricted to creating and simulating 4D videos… non-interactive and disconnected from progress"; skills gap the biggest barrier (~60%+) ([Frontiers 2022](https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2022.998309/full); [Preprints](https://www.preprints.org/frontend/manuscript/ad148ad07d5256aa15c6a1b0fde46bfa/download_pub)).
5. **Cost/licensing barriers** concentrate 4D into one seat ([Capterra](https://www.capterra.com/p/35289/Synchro/reviews/)).
6. **Poor IFC round-trip / lock-in.** `.nwd` closed, no IFC export ([rapidpipeline](https://rapidpipeline.com/en/a/conversions-navisworks-to-ifc/)); SYNCHRO loses grouping; RIB centers CPIXML.
7. **Performance on large federated models** — split by discipline/zone; SYNCHRO ships perf workarounds ([Zendesk](https://synchro.zendesk.com/hc/en-us/articles/6621412202007-Synchro-4D-PRO-Performance-Tips)). *(4D-specific severity partly inferential.)*
8. **4D rarely kept current** — whole "closing the loop" subfield exists because planned-vs-actual is normally open ([MDPI Buildings 13/2488](https://doi.org/10.3390/buildings13102488)). Depends on #1.
9. **Weak BCF/5D/6D/CDE integration — "4D as an island"** ([Procore](https://www.procore.com/library/4d-bim)). *(Vendor/blog framing — directional.)*
10. **Collaboration / multi-party exchange** — file-based handoffs reintroduce re-linking fragility.

---

## 5. Ranked Opportunities for a Web Platform

### Tier 1 — build first (high impact, high feasibility)

**O1. Durable, self-healing schedule↔model linking.** Reuse the **QA/rule engine** to auto-map tasks↔elements by classification/property/zone/type (not brittle names); persist against stable IFC GlobalIds; reconciliation pass re-heals broken links on new model/schedule version with a diff ("142 newly matched, 8 orphaned"). Keystone — unblocks O5.

**O2. Browser-native, multiplayer, zero-install 4D.** Timeline/Gantt driving **Highlighter** (install/in-progress/complete states) + **Hider** over fragments (both already in the stack: [Highlighter](https://docs.thatopen.com/Tutorials/Components/Front/Highlighter), [Hider](https://docs.thatopen.com/Tutorials/Components/Core/Hider)); real-time multiplayer + read-only share links for subs/clients.

**O3. Integrated 4D + 5D + 6D + BCF + progress in one model.** Scrub the timeline; **cash-flow (5D)** and **carbon-over-time (6D)** curves move with it; drop a **BCF** issue on an out-of-sequence element; attach RFIs to activities. The real moat — every other dimension is already built.

### Tier 2 — high impact, medium feasibility

**O4. openBIM-native 4D as portable data** — store/export as **IFC 4.3 `IfcWorkPlan`/`IfcWorkSchedule`/`IfcTask`/`IfcRelSequence`** + BCF (web-ifc parses these). *(Flag: real-world IFC 4.3 schedule import elsewhere is thin — don't over-promise round-trip.)*

**O5. Live progress tracking (planned vs actual)** — overlay % complete vs planned 4D in-model (manual first, later ingest Buildots/Doxel/OpenSpace); auto-highlight behind-schedule; raise BCF on divergence. Depends on O1.

**O6. Model-native takt / location-based sequencing** — draw zones on the model, sequence takt trains, flowline visualizations; wedge into VisiLean/Touchplan/Aphex buyers. VisiLean is the closest conceptual competitor.

### Tier 3 — table-stakes
**O7. Schedule import fidelity** (P6/Asta/MS Project XER/XML/CSV). **O8. Assisted/AI linking suggestions** beyond O1's rules.

**De-risk early:** (a) validate **fragment streaming under animation** on a real 500 MB+ IFC; (b) schedule-import fidelity; (c) prototype the auto-mapping engine (O1) first — where every incumbent bleeds.

**Reality check:** 4D adoption is genuinely low — you are partly *creating* demand. "$1.22B market" figures are single-source fabricated precision — do not cite ([Global Growth Insights](https://www.globalgrowthinsights.com/market-reports/building-information-modelling-market-105605)). Wedge into lean/takt teams who feel the pain most.

---

## 6. Key uncertainties flagged
- **Pricing** for Fuzor/Asta/ALICE/RIB is reseller/aggregator-sourced and conflicting — verify with vendors. Synchro figures cross-checked but promo/currency-dependent.
- **All quantitative market-size figures** are single-source with fabricated precision.
- **Fragment streaming/tiling under animation** for very large models unconfirmed — validate before committing.
- **IFC 4.3 schedule import/export** across other tools is thin — don't over-promise interop.
- Themes 5/6/9/10 lean partly on vendor/blog framing and forum anecdote — worth one more primary-source pass.

*(Full source list — ~90 cited URLs across Synchro/Bentley, Navisworks/Autodesk, other tools, web/AI/lean tools, That Open/openBIM/standards, and academic pain-point literature — retained in the research transcript.)*
