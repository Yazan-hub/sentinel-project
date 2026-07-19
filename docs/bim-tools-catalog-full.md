# BIM Software / Tools / Plugins — Full Catalog (2026)

*The complete, detailed reference from the 8-stream market scan (2026-07-19). ~70 tools across the whole project lifecycle, with function, deployment, licensing/cost, strengths, weaknesses, and Sentinel-mapping, cited to vendor/analyst sources. For the condensed strategic reading + the ranked replication targets, see `bim-tools-landscape.md`. For the platform thesis, see `STRATEGIC_REVIEW_2026-07.md`.*

**Sentinel-map key:** ✅ Sentinel has it · 🟡 partial/seed · ⬜ gap · "COMPETES/COMPLEMENTS/BUILDING BLOCK" for open-source & challengers. Prices are list where public, else "quote."

**Contents:** 1. Authoring & design · 2. Coordination / clash / QA-QC / issue tracking · 3. Revit data & parameter plugins · 4. 4D scheduling · 5. 5D costing · 6. CDE & project management · 7. 6D carbon / 7D FM / digital twins · 8. Open-source & web stack · 9. Emerging web-native challengers.

---

## 1. Authoring & design tools
*Verdict: do not attack head-on. Parametric authoring is defended by 20+ yrs of content libraries + drawing-production engines. Sentinel absorbs the downstream (view/extract/validate) layer.*

| Tool (vendor) | What it does | Cost (list, USD) | Strength | Weakness / ceiling | IFC posture | Sentinel |
|---|---|---|---|---|---|---|
| **Revit** (Autodesk) | De-facto parametric BIM authoring (arch/struct/MEP), RVT | ~$2,915/yr; AEC Collection ~$3,375/yr | Ecosystem gravity (content, Dynamo, add-ins, hiring) | Aging single-file arch, slow on big models, price-hike resentment | Proprietary; IFC export lossy | ⬜ authoring; ✅ downstream |
| **Archicad** (Graphisoft) | Architect-focused BIM, strong docs + BIMx | Studio $2,414/yr, Collaborate $2,840/yr (subscription-only from 2026) | Best architectural UX; strongest IFC among majors | Weak MEP/struct; perpetual killed | Best-of-breed certified IFC | ⬜ / ✅ (BIMcloud/BIMx overlap CDE+viewer) |
| **Tekla Structures** (Trimble) | Fabrication-level steel/precast detailing (LOD 400–500) | ~$2.5–4k/yr (Diamond/Graphite/Carbon) | Unmatched constructible detail; drives CNC | Structures-only; steep; quote opacity | Strong certified IFC incl. IFC4 | ⬜ / ✅ (Trimble Connect overlap) |
| **Allplan** (Nemetschek) | Arch + engineering; strong rebar/precast/bridge | from ~$1,800/seat/yr | Engineering-grade reinforcement; DACH strength | Small share outside DACH; dated UX | Solid IFC4 | ⬜ (Bimplus → CDE) |
| **Vectorworks Architect** (Nemetschek) | BIM + flexible 2D/3D; small studios, landscape, events | $1,530/yr (perpetual discontinued) | Design freedom (Parasolid), Mac-first, cheapest full BIM | Weaker "big BIM" data rigor | Good certified IFC export | ⬜ |
| **MicroStation / OpenBuildings** (Bentley) | Infra-grade CAD + multidiscipline building BIM | ~€4,400 (OpenBuildings, 12-mo) | Handles gigantic infra models; gov/transport lock-in | Building mindshare collapsing; complex licensing | Proprietary DGN; competent IFC | ⬜ (iTwin overlaps viewer/CDE) |
| **BricsCAD BIM** (Bricsys/Hexagon) | DWG-native CAD + AI BIM-ification | ~$1,890 perpetual or ~$991/yr | Perpetual option + DWG fidelity; cheap | Tiny content ecosystem; shallow BIM tools | DWG-based; decent IFC | ⬜ (24/7 → CDE) |
| **AutoCAD / Civil 3D** (Autodesk) | 2D/3D drafting; Civil 3D = roads/grading/utilities | AutoCAD ~$1,950–2,030/yr; Civil 3D ~$2,205–2,595/yr | DWG lingua franca; Civil 3D near-monopoly US civil | Not object-BIM (AutoCAD); DWG-trapped data | Proprietary DWG; IFC 4.3 infra slow | ⬜ (IFC 4.3 infra = future lane) |
| **SketchUp** (Trimble) | Fast conceptual 3D massing | Pro $399/yr, Studio $819/yr, Go $129/yr | Zero-friction; 3D Warehouse; real free web tier | Not real BIM; weak docs | Basic IFC export | ⬜ (share layer overlaps) |
| **Rhino 8 + Grasshopper** (McNeel) | Freeform NURBS/SubD + visual programming | **$995 perpetual**, no subscription | Grasshopper irreplaceable in computational design; beloved pricing | Not BIM without plugins (Rhino.Inside/VisualARQ) | IFC via plugins | ⬜ — *ally* (produces IFC Sentinel consumes) |
| **Bonsai** (ex-BlenderBIM) | Free native-IFC authoring in Blender | **Free (GPL)** | Only true native-IFC authoring in production; $0 | Alpha UX; Blender learning curve; volunteer velocity | IFC *is* the model | ⬜ — ecosystem ally |
| **FreeCAD 1.0 BIM** | Open-source parametric CAD; BIM workbench in core (Nov 2024) | **Free (LGPL)** | Genuine parametric BIM at $0; reads/writes IFC | Rough UX; small AEC base | Reads/writes IFC | ⬜ — clean IFC source |

*Also: Snaptrude, Arcol, Qonic, Forma, Hypar, TestFit, Skema — see §9. Defensible (don't attack): parametric modeling, content libraries, 2D documentation, fabrication detailing, computational design. Absorbable (Sentinel): viewing/federation, data extraction/enrichment, QA/IDS, clash→BCF, QTO, carbon, COBie, CDE, dashboards.*

Sources: [Revit](https://autodesksaudits.com/blog/revit-cost-2026-pricing-guide/) · [AEC Collection](https://digitalicence.com/aec-collection-usa-pricing-2026/) · [Graphisoft](https://www.graphisoft.com/en-us/pricing/) · [Tekla](https://www.tekla.com/products/tekla-structures/subscription) · [Allplan](https://www.allplan.com/package-overview/) · [Vectorworks](https://www.vectorworks.net/en-US/architect/buy) · [OpenBuildings](https://en.virtuosity.com/openbuildings-designer) · [BricsCAD](https://www.bricsys.com/en-us/store/bricscad) · [AutoCAD](https://autocadtips.com/blog/autocad-price-explained-monthly-and-annual-plans/) · [SketchUp](https://sketchup.trimble.com/en/plans-and-pricing) · [Rhino](https://www.rhino3d.com/buy) · [Bonsai](https://bonsaibim.org/) · [FreeCAD](https://en.wikipedia.org/wiki/FreeCAD)

---

## 2. Coordination · clash · model-checking / QA-QC · issue tracking
*Sentinel's sweet spot — it already ships headless dedup'd clash→BCF, web-native IDS validation, and a live web⇄Revit BCF loop.*

### 2a. Federation & clash
| Tool (vendor) | What it does | Platform | Cost | Strength | Weakness | Sentinel |
|---|---|---|---|---|---|---|
| **Navisworks Manage** (Autodesk) | Federates 60+ formats → NWD; Clash Detective (hard/soft/clearance), TimeLiner 4D, Quantification | Desktop (Win) | ~$2,605–2,740/yr | Industry standard; format appetite; mature clash rules | 20-yr desktop UX; NWC/NWD round-trips; results locked in desktop; no live multi-user; maintenance mode | 🟡 clash→BCF + web viewer + 5D |
| **ACC Model Coordination** (Autodesk) | Cloud auto-clash on publish, issues, design packages; Pro adds Revit Cloud Worksharing | Web (+plugins) | Pro ~$900–1,284/yr | Zero-setup auto clash grouping; issues into Revit | Autodesk lock-in; coarser than Navisworks; per-user cost balloons | 🟡 CDE + clash→BCF + live BCF |
| **Revizto** (Revizto SA) | Game-engine federated 2D+3D viewer + issue tracker + clash automation + dashboards | Desktop+cloud+VR | ~$450 (3u) → $1,500 (10u) → $3,000/yr (20u); enterprise custom | Best issue tracker + 2D/3D nav non-modelers use; accountability dashboards | Opaque pricing; clash younger than Navis/Solibri; proprietary cloud, thin openBIM (BCF file only) | 🟡 web viewer + live BCF + clash→BCF |
| **BIMcollab Zoom + Nexus** (KUBUS) | Nexus = cloud BCF hub with IDS "smart properties"; Zoom = desktop IFC viewer + clash + validation | Nexus web / Zoom desktop | Free viewer+BCF Managers; CDE ~€25/user/mo; platform quote | Purest IFC/BCF/IDS stack; free plugins seed adoption | Zoom desktop-bound; clash < Navisworks; brand fragmented | 🟡 **closest philosophical competitor** (Sentinel checks in-browser) |

### 2b. Model checking / QA-QC
| Tool (vendor) | What it does | Platform | Cost | Strength | Weakness | Sentinel |
|---|---|---|---|---|---|---|
| **Solibri** (Nemetschek) | Rule-based IFC checking (code/clearance/accessibility), clash, IDS editor+checking, BCF | Desktop (Java) + WebChecker (tokens) | Starter €99 · Essential €1,428 · Advanced €2,109 · Premium €2,772/yr | Deepest rule engine (logic on properties/spaces/accessibility); official IDS tooling | Heavy desktop Java; steep ruleset authoring; per-seat stacks; cloud young | 🟡 IDS validation — *web-native Solibri play* |
| **Verifi3D → Solibri CheckPoint** (Xinaps→Nemetschek) | Cloud rule-based checking, BCF output, ACC/SharePoint integrations | Web | folded in; now itself "legacy" behind WebChecker | Proved browser-native checking market | Absorbed + sunset; customers mid-migration | 🟡 **orphaned niche Sentinel inherits** |
| **Autodesk Model Checker + Interop Tools** (orig. COINS) | Batch-check Revit vs XML checksets (naming/params/standards); COBie extension, shared-params, etc. | Desktop (Revit add-in) | **Free** with Revit | Free; mandated in many BEPs (UK); checkset-sharing culture | Revit-only, RVT-only (no IFC); no cloud; clunky XML authoring | 🟡 IDS (Sentinel checks the IFC) |
| **ifcopenshell / IfcTester** | CLI/Python IDS validation of IFC | Any (code) | Free (LGPL) | Reference IDS implementation | No UI; DIY | 🟡 benchmark/backend for Sentinel's web IDS |

### 2c. Issue tracking / BCF backbones
| Tool | What it does | Cost | Sentinel |
|---|---|---|---|
| **BIMcollab BCF Managers** | Free Revit/Navis/Archicad/Tekla plugins → live BCF sync into paid Nexus | Free (hook to Nexus) | 🟡 live BCF — *copy the free-plugin GTM* |
| **Newforma Konekt** (ex-BIM Track) | Web issue hub (2D/3D, BCF) + email/RFI/submittal PIM | quote | 🟡 live BCF + CDE |
| **Trimble Connect** | Federation viewer, ToDos/BCF, openBIM glue | freemium → per-user | 🟡 web viewer + live BCF |
| **Catenda Hub / StreamBIM** | Browser openBIM CDE + BCF server (co-authored BCF-API) | quote/per-project | 🟡 CDE + live BCF + web viewer |

*Painful workflows sold on:* "50 models in 40 formats → one clashable federation before the Big Room"; "clash without a VDC engineer pressing the button"; "issues die in PDF reports + email, nobody owns what"; "EIR/IDS must be provably met before each milestone drop."

Sources: [Navisworks](https://www.autodesk.com/products/navisworks/overview) · [Navis pricing](https://novedge.com/products/buy-navisworks-manage-subscription) · [Solibri offerings](https://www.solibri.com/our-offerings) · [Solibri CheckPoint (AECbytes)](https://aecbytes.blog/2025/02/12/solibri-checkpoint-cloud-based-model-checking-for-aec/comment-page-1/) · [Xinaps acquisition](https://www.aecplustech.com/blog/xinap-vision-acquisition-future-aec-model-checking) · [Revizto pricing (G2)](https://www.g2.com/products/revizto/pricing) · [BIMcollab Nexus](https://www.bimcollab.com/en/products/bimcollab-nexus/) · [BIM Collaborate Pro](https://www.autodesk.com/products/bim-collaborate/buy) · [Interoperability Tools](https://interoperability.autodesk.com/) · [Model Checker](https://interoperability.autodesk.com/modelchecker.php)

---

## 3. Revit data & parameter plugins *(replicate as a bundled feature — this layer commoditizes to $0)*

| Tool (vendor) | What it does | Cost | Strength | Weakness | Sentinel |
|---|---|---|---|---|---|
| **Ideate** (BIMLink, Explorer, StyleManager, Sticky, IdeateApps) | BIMLink: Revit↔Excel bulk parameter push/pull; Explorer: audit/search/warnings triage; StyleManager: purge; Sticky: live Excel in sheets | from **$1,495/yr** bundle (5 tools); ent. license; 6-mo intro $500 | Standard answer to "edit 10,000 parameters without opening every family"; deep audit UX | Revit-only; per-seat on top of Revit; no IFC/web | 🟡 web BIMLink (Copilot + 6D data). GAP: bulk write-back into authoring model |
| **DiRoots** (DiRootsOne: SheetLink, ParaManager, FamilyReviser, OneFilter, TableGen…; ProSheets) | Revit↔Excel/Sheets sync; batch shared-parameters; batch export PDF/DWG/IFC/NWC | **Free** (DiRootsOne 100% free; ProSheets freemium 150 prints/mo) | Free undercut of Ideate; huge install base; services-led | Support/roadmap tied to consultancy; desktop Revit-only | 🟡 — proves users expect this for **$0**; bundle, don't sell |
| **pyRevit** (pyRevitLabs) | Python RAD + ~100 stock tools inside Revit; CLI fleet deploy | **Free/OSS** (Open Collective) | BIM-manager automation substrate; anything scriptable → a button | Needs Python; upgrade breakage per Revit release; single-maintainer risk | 🟡 Copilot ("describe → Sentinel runs it, on IFC") + plugin-UX template |
| **CTC Software** (BIM Project/Manager/Batch Suites + HIVE→Nexus) | Spreadsheet Link, family import/export, batch upgrades, cleanup, content library mgmt | quote/reseller | Breadth (dozens of tools); enterprise maturity | Overlaps Ideate/DiRoots; desktop-only | 🟡 Copilot/6D; content mgmt = ⬜ |
| **Guardian for Revit** | Real-time model protection: intercepts risky actions (deletes/pins/family loads), enforces standards | **$4,600/yr** base (≤25u) +$110/user | Unique "prevent the mistake before it happens"; measurable ROI | Revit-only; guardrails not fixes | ⬜ authoring-time governance — Sentinel gates at *exchange* instead |
| **iConstruct** (for Navisworks) | Data enrichment/reporting/appearance profiling in Navisworks federations | quote | Makes Navisworks data usable for construction | Rides a declining host | 🟡 clash→BCF + 5D data enrichment |

*Painful workflows:* "door schedules & COBie params mean editing thousands of values one dialog at a time"; "every firm rebuilds the same 30 batch utilities"; "one intern's Ctrl+drag corrupts a 400-sheet model on deadline week."

Sources: [Ideate](https://ideatesoftware.com/subscribe) · [Ideate BIMLink](https://ideatesoftware.com/ideate-bimlink-purchase) · [DiRoots](https://diroots.com/revit-plugins/) · [DiRootsOne](https://diroots.com/revit-plugins/dirootsone/) · [pyRevit](https://github.com/pyrevitlabs/pyRevit) · [CTC](https://ctcsoftware.com/product/bim-manager-suite/) · [Guardian](https://www.getguardian.tech/pricing)

---

## 4. 4D scheduling / construction sequencing
*Core mechanic: bind schedule tasks (from a CPM engine) to 3D elements, then play time forward. The category is desktop-locked — no browser-native mid-market "view-and-play 4D" exists.*

| Tool (vendor) | Task→element linking | Sim depth | Cost | Platform | Sentinel |
|---|---|---|---|---|---|
| **SYNCHRO 4D Pro** (Bentley) | Manual + rule-based auto-matching on properties/WBS; bi-dir P6/MSP/Asta sync | Deepest: growth, equipment/crane paths, temp works, workspaces; AI "SYNCHRO+" GA 2026 | ~**€5,476/yr** (Virtuosity) | Desktop (+web companions for progress) | 🟡🎯 4D timeline. GAP: equipment-path/temp-works sim |
| **Navisworks TimeLiner** (Autodesk) | Selection/search sets; Auto-Attach rules (name/layer/category); P6/MSP/CSV/Asta import | Basic appear/ghost/highlight; cosmetic animation | in Manage (~$2,605) / AEC Coll. | Desktop | 🟡 (Sentinel does this in-browser + fused 5D/6D) |
| **Fuzor** (Kalloc) | Live Revit link; drag-drop + filter batch linking | Very high: animated crews/cranes/trucks pathfinding, logistics, safety zones, VR | VDC $1,350/mo · Constr Pro $1,010/mo · … · Lite $140/mo | Desktop (GPU-heavy) | ⬜ crew/equipment/VR |
| **BEXEL Manager** (Bexel) | **Auto-generates schedule** from cost items + methodology templates + zones | Good 4D/5D playback + cash-flow curves; optimization | quote | Desktop (free viewer) | 🟡 closest concept — Sentinel's fused timeline, web-native |
| **ALICE** (ALICE Technologies) | Recipes/constraints on elements/zones; generates thousands of schedules | Scenario sim (crews/equipment/calendars); ~17% duration cut | ~**$50–150k/yr** | **Web (SaaS)** | ⬜ generative scheduling |
| **Asta Powerproject + 4D** (Elecosoft) | IFC loaded inside the scheduler; drag-drop objects→tasks (one app) | Playback; modest animation | quote (low-thousands/seat) | Desktop (+SaaS scheduler) | 🟡 (Sentinel's in-viewer timeline matches "one app") |
| *Upstream* **Primavera P6** (Oracle) | — | — | $3,520 perpetual +$774/yr, or ~$2,500/user/yr cloud | — | **must ingest XER/P6 XML** |
| *Upstream* **MS Project / Planner** | — | — | Plan 3 $30/user/mo | — | support MPP/XML import |

*Strategic:* only ALICE is web-native (and it's an optimizer, not a rehearsal tool). Sentinel can **derive task↔element links from the same classification that drives its 5D cost** → near-free auto-4D. **Vico died Jun 30 2024** — a live migration event.

Sources: [SYNCHRO](https://www.bentley.com/software/synchro/) · [SYNCHRO pricing](https://en.virtuosity.com/synchro-4d) · [SYNCHRO+ AI](https://blog.bentley.com/software/bentley-unveils-synchro-at-yii-2025-ushering-in-a-new-era-of-ai-powered-4d-construction-planning/) · [TimeLiner rules](https://help.autodesk.com/cloudhelp/2026/ENU/Navisworks-Timeliner/files/GUID-69067DF6-E23D-449A-8178-D0B8F509F957.htm) · [Fuzor pricing](https://www.kalloctech.com/purchase.jsp) · [BEXEL 4D/5D](https://help.bexelmanager.com/docs/help-center/bexel-manager/smart-4d-and-5d-bim-management/) · [ALICE](https://www.alicetechnologies.com/home) · [Vico EOL](https://frontierprecision.com/news/end-of-life-notice-trimble-products/) · [Powerproject 4D](https://elecosoft.com/us/products/asta/asta-powerproject-4d/) · [P6 cost](https://www.taradigm.com/how-much-does-primavera-p6-cost/)

---

## 5. 5D costing / quantity take-off
*Core pipeline: quantity capture → map to work items → apply rates → assemble BoQ per method (NRM/CESMM/UniFormat) → track change. No web-native NRM/CESMM model-linked estimator exists.*

| Tool (vendor) | What it does | Cost | Platform | Sentinel |
|---|---|---|---|---|
| **RIB CostX** (RIB, ex-Exactal) | 2D+3D/BIM takeoff live-linked to workbooks + rate libraries; **auto-revisioning** (diffs design changes); subcontractor comparison; carbon | quote (~AU$3–7k/seat/yr); tiers Complete/Core/Quantify | Desktop (Win) | 🟡🎯 model→BoQ. GAP: workbook engine, **revision diffing** (its moat), 2D takeoff |
| **RIB iTWO / RIB 4.0** (RIB) | Enterprise end-to-end 5D: estimating (mixes 5D + 2D/alphanumeric), scheduling, procurement, controls, 5D sim | enterprise quote (Std/Prem/Ult) | Cloud (RIB 4.0/MTWO) + on-prem | 🟡 5D core. GAP: schedule-linked 5D sim, procurement |
| **RIB Candy** (RIB CCS) | Estimating + planning + valuations: 2D QTO→BoQ, first-principles resource build-ups, CPM linked to cost, cash flow, subcontract | quote | Desktop + Candy Cloud | ⬜ resource-based rate build-up, valuations |
| **Buildsoft Cubit** (RIB, AU) | 2D + BIM (IFC) takeoff into estimate sheets; AI Estimating; Cubit Select bid comparison | **from AU$167/user/mo** | Desktop | 🟡 (gap: AI 2D takeoff, bid comparison) |
| **Bluebeam Revu** (Nemetschek) | PDF markup + 2D measurement/takeoff (areas/lengths/counts, Excel link) — capture, not estimate | Basics $260 · Core $330 · Complete $440/yr | Desktop + Cloud | ⬜ 2D PDF takeoff for unmodeled scope |
| **BEXEL Manager** (Bexel) | Federated IFC, classification-driven auto-QTO, Cost Estimator (versions, custom CBS), 5D sim | Lite €480 · Engineer €900 · Manager **€2,400/$2,800**/yr | Desktop + cloud companions | 🟡 closest twin (IFC-native, classification-driven — Sentinel does in-browser) |
| **Autodesk Takeoff → Forma Takeoff** | Web 2D (PDF) + 3D (Revit) takeoff in ACC/Forma, shared with Estimate | was ~$1,250/user/yr → quote | **Web** | 🟡 direct web competitor (RVT-gated) |
| **Autodesk (Forma) Estimate** (ProEst lineage) | Cloud estimating: centralized cost library, Forma-takeoff quantities → estimate lines, Excel export | quote (Preconstruction bundle) | **Web** | 🟡 (Sentinel counter: open IFC + NRM/CESMM + no Autodesk stack) |
| **Nomitech CostOS** | BIM 3D + 2D + GIS takeoff + resource-based estimating; **exports cost-loaded IFC**; benchmarking | enterprise quote | Desktop/server + cloud | ⬜ **cost-loaded IFC export** (on-brand Sentinel gap) |
| **Kreo** | Web AI 2D takeoff + estimating (auto-measure/count, GIA/GEA/NIA) | Lite $35 · Plus $70 · Pro $175/user/mo | **Web** | 🟡 (2D-only; Sentinel beats on 3D). GAP: AI 2D takeoff, UK area standards |
| *Secondary:* Trimble WinEst, Beck DESTINI Estimator, Sigma Estimates, **Glodon Cubicost** (APAC dominant), CostX/Naviate Revit exporters | keyed/model takeoff → estimate DBs | quote / per-seat | mostly desktop | mostly 🟡/⬜ (rate-library depth, APAC norms) |

*Standards note:* no tool hard-codes NRM/CESMM — they ship templates/libraries structured to it. A browser-native tool shipping **NRM2/CESMM4/ANZSMM BoQ templates over IFC quantities has no direct web competitor.* Gaps to close (ranked): rate libraries w/ first-principles → NRM/CESMM templates → **revision diffing** → 2D PDF takeoff → cost-loaded IFC export → Excel round-trip + bid comparison.

Sources: [CostX](https://www.rib-software.com/en/rib-costx/pricing) · [RIB 4.0](https://www.rib-software.com/en/rib-4-0) · [Candy](https://www.rib-software.com/en/rib-candy) · [Cubit pricing](https://buildsoft.com.au/cubit-estimating-pricing/) · [Bluebeam](https://www.bluebeam.com/pricing/) · [BEXEL pricing](https://bexelmanager.com/plans-pricing/) · [Forma Takeoff](https://construction.autodesk.com/pricing/autodesk-takeoff/) · [Forma Estimate](https://construction.autodesk.eu/products/autodesk-estimate/) · [CostOS](https://www.nomitech.com/costos) · [Kreo](https://www.kreo.net/pricing)

---

## 6. CDE & project/document management
*Sentinel IS a CDE — every row COMPETES. Access model + real-vs-faked ISO 19650 states + viewer performance are the battlegrounds.*

| Tool (vendor) | Access / cost | ISO 19650 depth | OpenCDE/BCF | Sentinel |
|---|---|---|---|---|
| **ACC → "Autodesk Forma"** | per-seat; BIM Collaborate Pro ~$1,284/yr; 2026 bundles quote-only | states=folders (**faked**), metadata editable | no public server; APS proprietary; BCF import/export | ✅ **incumbent to displace** — real state machine + immutable audit is the edge |
| **Trimble Connect** | Free tier; Pro $12.41/user/mo, Innovate $29.08 | shallow (statuses/releases) | good IFC; ToDos↔BCF | ✅ compete (low end) |
| **Oracle Aconex** | Unlimited (per project) or per-user, quote | strong (ISO 19650 + DIN SPEC 91391; immutable trail) | limited; BCF peripheral | ✅ audit echoes it at a fraction of cost |
| **Asite Adoddle** | from $375/mo (PPM+CDE) | **BSI Kitemark** — embedded approval states | partial API; limited BCF | ✅ mechanism parity — **gap = the badge** |
| **Bentley ProjectWise** | ~$400/user/yr entry, quote higher | good when configured (paid workshops) | minimal; iTwin APIs | ✅ (Sentinel wins on zero-config); gap: DGN/reference-file |
| **Procore** | ACV, **unlimited users**; ~$15–80k/yr | weak (doc control, no states) | absent; strong REST API | ✅ validates unlimited-user pitch; gap: field/financials |
| **Catenda Hub** | project-based, **unlimited users** | "100% ISO 19650 out of the box" | **full openCDE: BCF 2.1/3.0 + Documents + Foundation** | ✅ **closest architectural twin** — gap: expose a public BCF-API |
| **Dalux (Box+Field)** | free viewer (unlimited); Box quote | real (Shared/Published + naming) | API + BCF exchange | ✅ **viewer-performance bar to beat** (130,000 m² on a phone) |
| **Bricsys 24/7** (Hexagon) | **unlimited users**, low-cost quote | weak (audit + workflow, no 19650) | none | ✅ outclassed (only lesson: workflow-editor UX) |
| **Kroqi** (CSTB) | **freemium**, French-sovereign hosting | claims alignment; IFC+BCF | BCF format | ✅ proof free-CDE-for-SME viable; gap: data-residency option |
| **Newforma Konekt** (ex-BIM Track) | per-user tiers, quote | record mgmt, not states | **strong BCF heritage** | 🟡 partial (issue/email budget); gap: email capture |
| **Allplan Bimplus** | from €26/user/mo; free tier | light (revisions) | BCF-centric + REST | ✅ outclassed |
| **Viewpoint For Projects** (Trimble) | per-user quote | **Kitemark** heritage; UK doc-control | minimal | ✅ harvest as it stagnates |

*Two credibility gaps (paperwork, not code):* **BSI Kitemark** cert (Asite/Viewpoint have it — UK/Gulf procurement currency) and a **public BCF-API 3.0 + openCDE endpoint** (only Catenda serves the full family; Sentinel runs the loop internally). Note: buildingSMART's OpenCDE-API umbrella repo was **archived Mar 2024** — BCF-API stays alive; standardization momentum slowed.

Sources: [ACC 2026 pricing](https://contractorsandbuilders.com/pricing/autodesk-acc/) · [Trimble Connect plans](https://community.trimble.com/blogs/lindsay-renkel/2025/05/05/trimble-connect-new-pro-and-innovate-plans-faq) · [Aconex](https://www.oracle.com/construction-engineering/aconex/datasheet/) · [Asite ISO 19650](https://www.asite.com/blogs/7-enterprise-cde-criteria-for-bim-and-iso-19650) · [Procore pricing](https://www.procore.com/pricing) · [Catenda pricing](https://catenda.com/pricing/) · [Catenda openCDE](https://developers.catenda.com/bcf) · [Dalux Box](https://www.dalux.com/products/dalux-box/) · [Bricsys 24/7](https://www.bricsys.com/en-eu/247) · [Kroqi](https://kroqi.fr/) · [OpenCDE-API archived](https://github.com/buildingSMART/OpenCDE-API)

---

## 7. 6D carbon · 7D FM/handover · digital twins
*Regulation (EPBD 2028/2030, CALGreen 2026, BSA golden thread) is forcing auditable carbon + handover data — which only a governed dataset can defensibly produce.*

| Tool (vendor) | What it does | Cost | Sentinel |
|---|---|---|---|
| **One Click LCA** | Whole-building LCA + EPD authoring; largest LCA/EPD DB; Revit/IFC import; carbon-back-to-BIM | quote (~$15k–120k+/yr) | 🟡🎯 6D carbon on governed data — GAP: EPD DB breadth, compliance-report library |
| **TallyLCA** (Building Transparency) | Revit plug-in whole-building LCA (Sphera data) | ~$500+/seat/yr | 🟡 (Sentinel is Revit-independent). GAP: curated LCI dataset |
| **tallyCAT** (Building Transparency) | Free Revit plug-in → EC3 material quantities, bidirectional | free | 🟡 same QTO step Sentinel does from IFC |
| **EC3** (Building Transparency) | Free open embodied-carbon calculator + largest open EPD DB; API used by Autodesk/Bentley/cove | **free/open** | 🟡 — **integrate EC3's EPD API**, not compete |
| **cove.tool** | Web early-stage energy/daylight/cost/embodied carbon + optimization | quote (~$500/mo) | 🟡 (web-native cousin). GAP: energy simulation |
| **IES VE** | Full dynamic thermal simulation (energy/HVAC/daylight/CFD, compliance) | tiered quote | ⬜ compliance-grade simulation (partner) |
| **gliderbim** (Glider) | CDE + asset-info mgmt: validate structured data, IFC+COBie exchange, exception reporting | quote | 🟡 (Sentinel collapses "handover=a project" to a permission change) |
| **Zutec** (BuildData; acq. Operance) | CDE + Part L compliance + digital handover + O&M + **BSA Gateway 3** | quote | 🟡 golden-thread audit = native. GAP: BSA Gateway templates |
| **IBM Maximo** | Enterprise asset mgmt (EAM): work orders, predictive maintenance, AI | AppPoints, six-figure at scale | ⬜ — **feed it COBie/IFC**, don't fight |
| **IBM TRIRIGA** | IWMS: RE portfolio, lease accounting, space, capital projects | enterprise quote | ⬜ — feed target |
| **Archibus** (Eptura) | IWMS/CAFM: space/moves/maintenance; strong Revit link | quote | 🟡 space/asset overlap; gap: moves/maintenance |
| **Planon** | IWMS "Smart Sustainable Building Mgmt": RE/space/asset/energy/ESG/IoT | quote SaaS | 🟡 closest "one dataset across carbon+FM" but not model-native |
| **MRI Evolution** (ex-FSI) | CAFM: planned/reactive maintenance, compliance, mobile | quote | ⬜ feed target |
| **Autodesk Tandem** | Cloud digital twin: aggregate Revit/IFC → facility twin, asset tagging, IoT streams | free tier + per-facility sub | 🟡 head-to-head; Sentinel = open IFC + owner-held data + audit |
| **Bentley iTwin** | Open API platform for infra digital twins (iModel federation, change tracking) | consumption | 🟡 Sentinel plays this role on @thatopen/Supabase far cheaper |
| **Willow** | Operational-AI twin: buildings ontology + live data + Copilot | enterprise quote | 🟡 where 7D goes next (graph+AI); gap: IoT/telemetry |
| **Twinview** (Invicara) | "Intelligence layer" over BMS/IoT/CAFM/BIM/docs | quote | 🟡 overlaps "one pane" without governed source |
| **Siemens Building X** | Digital building platform (energy/ops/security) on Xcelerator | per-app SaaS | 🟡 OT-side, complementary |
| *Also:* **dRofus** (room/equipment data planning → handover), Autodesk **COBie Extension** (free) | — | quote / free | 🟡 7D — Sentinel's COBie-as-a-live-view replaces the Revit COBie extension |

*Why handover fails:* COBie is produced once, late, as a contractual checkbox by a party (the contractor) with no stake in operational usability; naming never matches the owner's asset register; the deliverable is a disconnected spreadsheet. NIST priced inadequate interoperability at **$15.8B/yr**, falling mostly on O&M. *Sentinel differentiators:* carbon inherits the audit trail (regulator-defensible WLC number no LCA silo produces); handover = a permission change (COBie as a live view). *Honest gaps:* EPD/LCI DB licensing, energy simulation, EAM execution (feed, don't fight), IoT/telemetry/AI-ontology, BSA Gateway templates.

Sources: [One Click LCA](https://www.oneclicklca.com/pricing/) · [Tally](https://www.choosetally.com/news/) · [EC3](https://www.buildingtransparency.org/tools/ec3/) · [cove.tool](https://www.aecplustech.com/tools/cove-tool) · [IES VE](https://www.iesve.com/software/virtual-environment) · [Zutec](https://www.zutec.com/) · [Planon](https://planonsoftware.com/us/) · [Archibus/Eptura](https://eptura.com/) · [iTwin](https://www.bentley.com/software/itwin-platform/) · [Willow](https://willowinc.com/) · [Tandem](https://www.autodesk.com/products/tandem/overview) · [EPBD](https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficient-buildings/energy-performance-buildings-directive_en) · [CALGreen](https://www.dgs.ca.gov/BSC/CALGreen) · [NIST GCR 04-867](https://www.nist.gov/publications/cost-analysis-inadequate-interoperability-us-capital-facilities-industry)

---

## 8. Open-source & web-BIM stack *(know your foundation)*

| Tool (vendor/project) | What it does | Licensing | Sentinel |
|---|---|---|---|
| **That Open** (Components/Fragments/web-ifc) | TS/JS libs to build browser BIM on three.js: IFC in/out, viewer, Fragments binary streaming | Components/Fragments **MIT**, web-ifc **MPL-2.0** | **BUILDING BLOCK — Sentinel's foundation.** Healthy cadence, thin funding → keep fork-readiness |
| **xeokit SDK** (Creoox) | WebGL BIM viewer SDK; XKT format; production-proven (Thinkproject, Fieldwire, Deutsche Bahn) | **AGPL-3.0 + paid commercial** | **COMPETITOR / road not taken** — AGPL would owe Creoox a fee (the cost model Sentinel kills); That Open was the right call |
| **Speckle** (Speckle Systems) | Open AEC data hub: versioned object exchange, viewer, connectors, Automate (CI/CD on model commits) | server **Apache-2.0**; SaaS Free/Team $99/mo/Enterprise | **COMPETITOR (data hub)** + COMPLEMENT (connectors feed Sentinel). Best-funded OSS (Suffolk invested Apr 2026); NOT an ISO 19650 CDE |
| **IfcOpenShell** | C++/Python IFC toolkit + geometry engine; IfcConvert, ifcpatch | **LGPL-3.0** | **BUILDING BLOCK (could use)** — heavy backend IFC jobs |
| **IfcTester** | IDS validation of IFC (reference implementation) | LGPL-3.0 | COMPLEMENT/benchmark for Sentinel's web IDS |
| **Bonsai** (ex-BlenderBIM) | Native-IFC authoring in Blender | GPL-3.0 | COMPLEMENT — free authoring feeding IFC; not absorbable |
| **BIMserver** | Model-driven IFC server (object DB, versioning) | AGPL-3.0 | legacy architecture — Sentinel's Supabase CDE covers this |
| **Dynamo** (Autodesk) | Visual programming for Revit automation | Apache-2.0 core (free with Revit) | COMPLEMENT (feeds Sentinel) → long-term absorbable |
| **pyRevit** | Python RAD + tools in Revit | GPL-3.0, free | COMPLEMENT — distribution channel + plugin-UX template |
| **Rhino.Inside.Revit / Grasshopper** (McNeel) | Rhino+GH inside Revit for parametric authoring | MIT plugin (needs Rhino $995) | COMPLEMENT — upstream authoring |
| **Ladybug/Honeybee** (+ Pollination) | Environmental analysis (Radiance/EnergyPlus/OpenFOAM) | OSS core; Pollination cloud paid (Rhino $1,375/yr, Revit $2,750/yr) | COMPLEMENT — future analysis pillar; Pollination = the OSS-core+paid-cloud model Sentinel itself pursues |

Sources: [thatopen.com](https://thatopen.com/) · [engine_components](https://github.com/ThatOpen/engine_components) · [Speckle pricing](https://speckle.systems/pricing) · [Suffolk invests in Speckle](https://aecmag.com/collaboration/suffolk-technologies-invests-in-speckle/) · [xeokit-sdk](https://github.com/xeokit/xeokit-sdk) · [ifcopenshell.org](https://ifcopenshell.org/) · [pyRevit](https://github.com/pyrevitlabs/pyRevit) · [Pollination pricing](https://www.pollination.solutions/pricing)

---

## 9. Emerging web-native challengers *(the trust layer is theirs to ignore)*

| Tool (vendor) | Stack layer | Funding / traction | Cost | Governance/CDE/validation? | Sentinel |
|---|---|---|---|---|---|
| **Qonic** (Ghent, ex-Bricsys) | Browser data-editing + coordination + (now) authoring/drawings on huge models | founder-financed (post-Bricsys→Hexagon ~$100M exit); buildingSMART openBIM Award 2025 | **area-based** (m² of portfolio); free ≤5,000 m²; unlimited viewer users | **Partial — the only real one:** data validation/enrichment, clash, issues, "Information Manager" persona, "model quality hub" roadmap. **No ISO 19650 states/audit** | **COMPETES directly** — Sentinel edge: 19650 workflow + immutable audit + standard IDS + live BCF + 5D/6D/7D |
| **Motif** (Boston/NY; ex-Autodesk co-CEO A. Hanspal) | Review/collab canvas → authoring (5–10 yr) | **$46M** (Redpoint seed, CapitalG A); V1 Apr 2025 | $25/user/mo | **No** — "linked information model," deliberately anti-central | COMPETES on review/BCF collab; concedes governed-dataset ground |
| **Arcol** (NYC) | Early BIM authoring + Boards (design→presentation) | ~**$20M** (Figma/Procore/Mozilla CEO angels) | free solo; Team $100/user/mo | **No** (no IFC even) | Mostly no overlap; light compete on stakeholder review |
| **Snaptrude** (NYC/Bengaluru) | Early design→schematic BIM, Revit interop, AI agents | **$14M** Series A (Foundamental+Accel); ~$21.5M total | free; $60/mo; $100/mo; Enterprise | **No** | COMPETES early-phase browser BIM; no trust layer |
| **Autodesk Forma / Forma Building Design** | Incumbent next-gen: site→LOD 200/300 cloud design; Revit as "Connected Client" | Autodesk-scale; Building Design beta late 2025 | subscription (AEC Coll.); Building Design pricing not public | **No (in Forma)** — governance stays in separate paid ACC/BIM 360 | COMPETES as gravity well; Sentinel counter = open IFC + governance included, no Autodesk toll |
| **Hypar** (ex-"father of Dynamo") | Generative space planning; "schema-less" AI inference | $8.28M ($5.5M A, 2023) | quote | **Anti-governance by design** (AEC Mag flags the liability/sign-off gap) | No product overlap; **philosophical opponent** — Sentinel's IDS/schema is the direct rebuttal |
| **TestFit** (Dallas) | RE feasibility / generative site solving | **$22M** ($20M A, 2022; Prologis pilot) | $2.1k → $10–15k+/yr, unlimited users | **No** | No overlap (pre-design); upstream feed |
| **Finch** (Stockholm) | Generative residential floorplans (graph rules + AI) | $3.1M; launch Dec 2024; 80k waitlist | €49/mo → Enterprise | **Partial-adjacent** (code-compliance feedback on *designs*, not datasets/process) | No overlap; its rule-embedding validates "machine-checkable rules sell" |
| **Nvidia Omniverse + OpenUSD** | Viz/twin substrate, USD interchange | Nvidia-scale; **Launcher retired Oct 1 2025** (pivot apps→SDKs) | free dev SDKs; enterprise per-GPU | **No** (interchange + rendering) | Complements/no overlap (Sentinel is three.js/WebIFC, no RTX dep); cautionary tale for viz-without-dataset |
| **Prevu3D** (Montreal) | Reality-capture → editable mesh twins (industrial) | ~$11.8M ($10M A, 2023) | enterprise tiers | **No** (clash-on-scan) | No overlap (as-built industrial); possible 7D complement |
| **Higharc** (Durham NC) | Vertical cloud BIM for US homebuilding | ~**$80M** ($53M B, 2024) — best-funded BIM startup | enterprise SaaS | **No** | No overlap (single-family vertical); proof vertical cloud-BIM raises big |
| **Kubity** | SketchUp/Revit → web/AR sharing | **DEAD** (domain parked for sale) | — | — | Market lesson: thin viz-sharing without data/governance doesn't survive |

*Headline:* the entire funded BIM-2.0 wave builds the **pencil, not the contract** — none ship suitability codes, WIP→Shared→Published→Archived states, immutable audit, or IDS-style dataset validation. **Qonic is the one convergence threat.** Both Motif ("linked information model") and Hypar ("bet against schema") *explicitly abdicate* the single-source-of-truth/trust role — a stated non-goal for the two most interesting challengers. Someone still has to be the layer where data is validated, staged, approved, and auditable. **That's Sentinel.**

### 9a. Addendum — deferred viz-stream research (folded in 2026-07-20)

*From a delayed research stream (the Omniverse/Prevu3D/Kubity/viz agent that finished after the main scan). Fresh facts below **supersede** the table where noted; single-source claims flagged.*

- **Nvidia Omniverse — now fully free, AEC de-prioritized (supersedes the §9 row's "enterprise per-GPU").** Licensing went from **$4,500/GPU/yr** (or $22,500/GPU perpetual) → **free for dev, production _and_ redistribution** (announced 1 Jul 2026); the NVIDIA-AI-Enterprise subscription is now optional (SLA support only). Real monetization is GPU pull-through, not licenses. The current Omniverse landing page shows **no AEC use cases at all** — the pivot is industrial/physical-AI (factories, robotics, AV); packaged AEC apps died with the Launcher (retired 1 Oct 2025). Even the **Foster + Partners** case study was refocused from "Omniverse across 14 offices" to RTX/CUDA powering their in-house *Cyclops* sim plugin — Omniverse no longer mentioned [single-source]. IFC still enters only via Revit-connector → USD (loses the openBIM contract). *Strategic read: viz horsepower just commoditized to $0, pushing all differentiation up-stack to the governance layer none of them occupy.*
- **OpenUSD / AOUSD** reached **Core Specification 1.0 (17 Dec 2025)** — first production-ready written standard; AEC members incl. Trimble, Siemens, Hexagon. **No confirmed AOUSD↔buildingSMART liaison** in retrievable sources → IFC↔USD standardization is *not* yet institutionalized.
- **Prevu3D — +$5M (supersedes the §9 row's ~$11.8M total).** Raised **$5M from Fonds de solidarité FTQ (announced 9 Mar 2026)** on top of the 2023 $10M Series A (Cycle Capital) → ~$16.8M. Published tiers now explicit: **Scanner from $5k/yr · Owner/Operator $10k/yr · AEC/Design $15k/yr · Enterprise custom**. Still geometry-first (point-cloud→editable mesh + asset tags); **no native IFC**, interchange via proprietary Revit/MicroStation/Omniverse plugins; "validation" = CAD-vs-scan geometry only, not data/rule validation.
- **Kubity — DEAD, verified three ways (July 2026):** kubity.com serves a domain-for-sale page; pro.kubity.com no longer resolves (DNS ENOTFOUND); Tracxn lists it "deadpooled." Paying users lost upload capability with no migration path — the cautionary tale for cloud viz without a data moat.
- **New viz-cloud signal (not previously in the catalog):** **Chaos** retired the legacy Enscape web platform (my.enscape3d.com) on **30 Sept 2025**, migrating sharing into **Chaos Cloud Collaboration** — consolidating, not abandoning, browser sharing. **Twinmotion Cloud** (Epic) offers browser presentation via pixel-streaming. Both are presentation-only: no BIM data, no governance, no IFC round-trip. **Shapr3D** stays native (iPad/desktop) direct-modeling CAD — only peripherally relevant [unverified this session].

*Governance verdict unchanged and reinforced:* pairing any of these vendors with "ISO 19650 / CDE" returns nothing. The addendum only hardens the §9 headline — the trust layer remains empty.

Addendum sources: [Omniverse free — NVIDIA forum](https://forums.developer.nvidia.com/t/nvidia-omniverse-licensing-change/375138) · [StorageReview: Omniverse free](https://www.storagereview.com/news/nvidia-quietly-makes-omniverse-free-for-production-use) · [Omniverse landing](https://www.nvidia.com/en-us/omniverse/) · [Foster+Partners case study](https://www.nvidia.com/en-us/case-studies/foster-partners/) · [AOUSD](https://aousd.org/) · [Prevu3D pricing](https://prevu3d.com/pricing/) · [Chaos Enscape](https://www.chaos.com/enscape) · [Twinmotion Cloud](https://www.twinmotion.com/twinmotion-cloud)

Sources: [Qonic pricing](https://www.qonic.com/pricing) · [AEC Mag: Rebuilding BIM – Qonic](https://aecmag.com/bim/rebuilding-bim-qonic/) · [Motif interview/funding](https://aecmag.com/bim/motif-to-take-on-revit-exclusive-interview/) · [Arcol unleashed](https://aecmag.com/bim/arcol-unleashed-bim-2-0/) · [Snaptrude $14M](https://www.snaptrude.com/blog/snaptrude-raises-14m-series-a-from-existing-investors-foundamental-and-accel-and-launches-sketch-to-bim-workflows) · [Forma Building Design](https://aecmag.com/bim/autodesk-targets-bim-with-forma-building-design/) · [Hypar's bet against schema](https://aecmag.com/bim/hypars-big-bet-against-schema/) · [TestFit $20M](https://www.thesaasnews.com/news/testfit-raises-20-million-in-series-a/) · [Finch untethered](https://aecmag.com/cad/finch-untethered/) · [Omniverse Launcher deprecation](https://docs.omniverse.nvidia.com/launcher/latest/index.html) · [Higharc $53M](https://www.higharc.com/newsroom/higharc-announces-53m-series-b-investment)

### 9b. Addendum — deferred generative/early-stage research (folded in 2026-07-20)

*From the delayed Forma/Hypar/TestFit/Finch research stream. Covers two tools **new to this catalog** (Swapp, Augmenta) plus facts that **update** existing §9 rows. Single-source claims flagged.*

**New entries (different segments — not early-stage massing):**

| Tool (vendor) | Stack layer | Funding | Cost | Governance/CDE/IDS? | Sentinel |
|---|---|---|---|---|---|
| **Swapp** (Tel Aviv/Houston) | **Late-stage CD automation** — agentic assistant ("Frank") inside Revit/ArchiCAD, writes dims/tags/sheets/full CD sets to firm standards | **$18.5M** ($11.5M A 2023, Eurazeo) | not public (demo/sales) | **Firm-QA only** — validates output vs *firm* standards; **no ISO 19650/IDS/IFC** mention anywhere | No product overlap (opposite end from authoring); its firm-QA-rule engine shows the market wants machine-checked deliverables — Sentinel does it at the *standards/dataset* level |
| **Augmenta** (Toronto, ex-Autodesk) | **Detailed MEP design automation** — "foundation model for construction"; shipping product = Electrical (ACP 2.0), coordinated code-compliant conduit models | ~**$25.6M USD** ($10M/US led by Prelude, Mar 2025; total ≈$37M CAD) | not public | **No** (fits "into current design workflow"; no ISO 19650/IDS/IFC) | No overlap (MEP autorouting, upstream); feeds the authoring stack, doesn't govern it |

**Updates to existing §9 rows:**
- **Forma** — now the group's **best openBIM**: **exports IFC 4.3** ("Export as IFC to Docs") in addition to importing IFC as context mesh [single-source on 4.3]. Standalone **~$185/mo** or free-in-AEC-Collection [single-source]. Momentum piling up: Esri ArcGIS-for-Forma (Jul 2025), Revit↔Forma bridge strengthened (Apr 2026), Graphisoft Archicad–Forma connection previewed (Jun 2026). ISO 19650 story still lives only in Autodesk Docs/ACC ("Forma Data Management"), **not** the design tool — content-farm claims that "Forma is an ISO 19650 CDE" are unverifiable and conflate the two.
- **Finch** — funding now **~$4.2M total** (adds a ~€1M Ampli round + ~$1.13M Seed-III Apr 2025 [single-source] to the €2.5M 2022 seed; the "$3.1M" in the table was the Dec-2024 figure). Traction by mid-2026: **130,000+ projects, users in 100+ countries** (ref. Sweco). Enterprise **€14,500/yr for 3 seats**; its "code & compliance checking" is *building-code*, not information-management governance; **no explicit IFC export** (native Revit only).
- **TestFit** — pricing confirmed (**Parking $2,100 · Site Solver $10k · Portfolio $15k**/yr); rode the data-center-configurator wave [single-source]; still **no IFC export at all** (Revit/.tfrvt/SketchUp/DXF/glTF only) — the most closed of the group.

*Governance verdict, reinforced across all six:* none ship an ISO 19650 / CDE / IDS layer; interchange is overwhelmingly **direct-to-Revit plugins** — these tools *feed* the incumbent stack, they don't govern it. AEC Mag's own warning is the tell: Hypar-style schema-free AI *increases* the need for exactly the validation/audit layer this whole cohort skips. That layer is Sentinel's.

Addendum sources: [Forma Building Design](https://aecmag.com/bim/forma-building-design/) · [Esri for Forma](https://aecmag.com/geospatial/esri-launches-arcgis-for-autodesk-forma/) · [Hypar bet against schema](https://aecmag.com/bim/hypars-big-bet-against-schema/) · [TestFit pricing](https://www.testfit.io/pricing) · [Finch untethered](https://aecmag.com/cad/finch-untethered/) · [Finch pricing](https://finch3d.com/pricing) · [Swapp Series A](https://www.thesaasnews.com/news/swapp-raises-11-5-million-in-series-a) · [Augmenta $14.4M CAD](https://betakit.com/augmenta-closes-14-4-million-cad-to-advance-quest-towards-ai-driven-building-design/)

### 9c. Addendum — deferred governance-landscape + remaining-startup streams (folded in 2026-07-20)

*From three late streams (governance/IDS/CDE landscape · browser-BIM/Speckle sweep · Qonic/Snaptrude/Arcol/Motif deep-dive). Only material **not already in §2/§6/§9** is captured; single-source claims flagged.*

**(i) The IDS / validation layer — Sentinel's actual arena, matured fast:**
- **IDS v1.0 became a Final buildingSMART Standard on 3 Jun 2024.** Tooling followed within ~18 months: buildingSMART's **IDS-Audit-tool** (MIT, v1.0.0 Oct 2024, validates `.ids` files), **ifctester** in IfcOpenShell (LGPL — "library, CLI and **webapp** for IDS model auditing"), Solibri **IDS Editor**, BIMcollab (Zoom auto-validates vs IDS), ACCA **usBIM.IDS** (+ IDS-in-Revit via usBIM.revolution, Mar 2026), and **Qonic** (browser `.ids` upload). **~57 self-reported implementations** — but buildingSMART **does not verify the list, and no certification exists** → *certified, web-native, workflow-integrated IDS checking is nobody's core product.* That's an open lane Sentinel already occupies (KF-B).
- **The one pure web-native model-checker was acquired and killed.** Solibri (Nemetschek) bought **Verifi3D/Xinaps (7 Jan 2025)**, rebranded it **Solibri Checkpoint**, then **discontinued it for new purchase (13 Apr 2026)**, migrating users back to *desktop* Solibri (Essential €1,428/yr → Premium €2,772/yr, "WebChecker token" bolt-on). verifi3d.com now redirects to the sunset notice. **→ the browser-based validation slot is currently vacant** — the single most direct market signal for Sentinel's in-browser IDS/clash. Nemetschek is separately buying validation (Firmus AI via Bluebeam, Sep 2025; GoCanvas Jul 2024; HCSS Jul 2026).

**(ii) Speckle — new §9 entry, the adjacent "one to watch":**

| Tool (vendor) | Stack layer | Funding | Cost | Governance/CDE/IDS? | Sentinel |
|---|---|---|---|---|---|
| **Speckle** (London) | AEC **data hub** — versioned object data (not files) from Revit/Rhino/etc; viewer, automation, now analytics/AI | **$12.5M A** (Addition, late 2024; ~$19.2M total [single-source]) + **Suffolk Technologies strategic (Apr 2026)** | Free (1 project); Team $99/mo; Enterprise | **Partial & rising** — "Model Validation" (beta→saved checks) + Speckle Automate; AEC Mag calls it "governance infrastructure." **But rules-based, not IDS; CDE *integrations*, not a CDE; no ISO 19650 state machine** | **Closest philosophical competitor to the Governed Element Graph.** Suffolk buying "normalized BIM data for AI" is the *same wedge*. Sentinel edge: IDS-standard + ISO 19650 states/audit, not proprietary rules |

**(iii) Other new/dead entries (fold into §9's map):**
- **Skema** (ex-Revit founders Rozmanith/Harpham) — AI schematic→**native Revit** from a firm's past catalogues; authoring-acceleration beside Revit; funding undisclosed; **no governance/IFC**.
- **Giraffe** (giraffe.build) — browser urban feasibility (GIS + calc + app marketplace); **Core $45/mo, Teams $1,500/user/yr**; "governance" = enterprise IT (SOC2/ISO 27001), **not ISO 19650**; no IFC.
- **Rayon** (Paris, ~€6M [single-source]) — "Figma of 2D CAD," explicitly **not BIM**; peripheral.
- **Bild AI** (YC W25, $3.1M seed, Khosla) — AI reads blueprints for estimating; the "AI reads plans" wave, no model/IFC layer.
- **Infurnia** (India) — cloud BIM for interiors→manufacturing; niche vertical.
- **DEAD:** **BeamUP** (pivoted entirely out of BIM into supply-chain AI — its $15M-seed building-design play failed) and **Modumate** (domain no longer resolves). Two more data points that VC-backed BIM authoring **without a data/governance moat** dies (cf. Kubity §9a).

**(iv) Corrections to existing §9 rows (from the deep-dive):**
- **Arcol** total is ~**$17.1M** [single-source PitchBook] (seed ~$5.1M + undisclosed late-2024), not ~$20M; IFC is **mesh-only import**, semantic round-trip on roadmap.
- **Snaptrude** total **$21.8M** (seed $6.6M Jan 2023 + $14M A Nov 2023); **no Series B** as of Jul 2026; IFC is **import-only** (export is .rvt/Rhino).
- **Motif** IFC support is **none today** (OBJ/GLB + Revit/Rhino streaming only); IFC/RVT is stated intention.
- **That Open Company** (Sentinel's own supply chain) — **no public funding found**, platform.thatopen.com is a bare login dashboard, no competing hosted CDE; permissive licenses (MIT/MPL-2.0). Watch item for sustainability, not a competitor.

**(v) CDE cert/API updates for §6:** **Thinkproject** gained **TÜV SÜD ISO 19650 attestation (Feb 2024)** for its CONCLUDE "NextGen CDE" — another certified rival beside Aconex/Asite. **BCF 3.0 mandates the OpenCDE Foundation API** as a prerequisite, but server-side BCF-API-3.0 + Foundation adoption remains thin/vendor-by-vendor (Trimble Connect Topics API, Catenda) — OpenCDE is still aspiration, not default. Reinforces §6's "public BCF-API 3.0 endpoint" as a real differentiator.

Addendum sources: [IDS repo](https://github.com/buildingSMART/IDS) · [IDS-Audit-tool](https://github.com/buildingSMART/IDS-Audit-tool) · [ifctester/IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) · [Solibri Checkpoint discontinuation](https://www.solibri.com/checkpoint) · [Solibri pricing](https://www.solibri.com/pricing) · [Firmus AI acq.](https://www.nemetschek.com/en/news-media/ngroup-firmus-ai-acquisition) · [Speckle raises $12.5M](https://speckle.systems/blog) · [Suffolk invests in Speckle](https://aecmag.com/collaboration/suffolk-technologies-invests-in-speckle/) · [Speckle pricing](https://speckle.systems/pricing) · [Thinkproject CDE](https://thinkproject.com/products/cde/) · [Skema](https://aecmag.com/bim/bim-workflow-compression-with-skema/) · [Giraffe pricing](https://www.giraffe.build/pricing) · [BeamUP pivot](https://techcrunch.com/2022/03/30/ai-powered-building-design-platform-beamup-emerges-from-stealth-with-15m/) · [BCF-API](https://github.com/buildingSMART/BCF-API)

---

*Compiled from 8 parallel research streams; ~90 cited sources retained in the scan transcripts. Costs/claims are as-published on vendor/analyst pages (July 2026); quote-only vendors are marked. See `bim-tools-landscape.md` for the strategic synthesis + ranked replication targets, and `STRATEGIC_REVIEW_2026-07.md` for the platform wedge.*
