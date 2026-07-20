# The BIM Tools Landscape — Market Scan & Sentinel Replacement Map

*Prepared 2026-07-19. Synthesis of an 8-stream deep scan (authoring · coordination/QA · 4D · 5D · CDE · 6D-7D · open-source stack · emerging challengers), ~70 tools, cited to vendor pages. Purpose: map the software/tool/plugin subscriptions a firm pays for across the project lifecycle, identify where Sentinel already overlaps vs. has a gap, and rank the targets to replicate. Companion to `STRATEGIC_REVIEW_2026-07.md` (the "Governed Element Graph" wedge) and `killer-features-vision.md`.*

---

## 0. The three findings that shape everything

1. **The cost stack is per-seat, desktop-locked, and duplicative.** A single mid-size coordinator's toolchain routinely runs **€10–20k+/user/year** spread across a dozen apps and 2–3 clouds (worked example in §2), each holding its own stale copy of the same model.
2. **The pricing wedge is proven: unlimited-user, per-project, transparent.** Procore (ACV, unlimited users), Aconex (Unlimited), Catenda, Dalux (free viewer), and Qonic (area-based) already sell this. Rule for Sentinel: **charge for the project, never for the viewer seat.**
3. **The governance/trust layer is uncontested.** No funded challenger (Motif, Arcol, Snaptrude, TestFit, Higharc, Hypar, Forma) ships an ISO 19650 CDE, suitability states, immutable audit, or IDS validation. The whole wave attacks *authoring/review/viz*. **Sentinel's CDE + audit + IDS + BCF occupies ground venture capital is ignoring.** (Only **Qonic** is converging — the one to watch.)

**Strategic consequence:** don't fight authoring (Revit/ArchiCAD/Tekla are defended by 20 yrs of content + drawing engines). Absorb the *downstream* layer — viewing, coordination, QA, 4D–7D, CDE — which every incumbent's own cloud play (Forma, BIMcloud, Trimble Connect, iTwin) is already separating from authoring. Win it on three axes the incumbents can't combine: **web-native graphics (the hook) · one governed dataset (the retainer) · validation-against-their-legacy-export (the trust-gap killer).**

---

## 1. The landscape by lifecycle stage

Legend — **Sentinel:** ✅ has it · 🟡 partial/seed · ⬜ gap · 🎯 = a ranked replacement target (§4). Prices are list where public, else "quote."

### Design / authoring — *do NOT attack head-on*
| Tool | Cost (list) | Sentinel |
|---|---|---|
| Revit (Autodesk) | ~$2,915/yr/seat | ⬜ authoring; ✅ view/extract/validate its IFC output |
| Archicad (Graphisoft) | ~$2,414–2,840/yr | ⬜ / ✅ downstream |
| Tekla (Trimble) | ~$2.5–4k/yr | ⬜ / ✅ downstream |
| Vectorworks / Allplan (Nemetschek) | $1,530 / ~$1,800/yr | ⬜ |
| BricsCAD BIM (Hexagon) | ~$991/yr or ~$1,890 perpetual | ⬜ |
| Rhino + Grasshopper (McNeel) | $995 perpetual | ⬜ — *ally* (produces IFC Sentinel consumes) |
| **Free/OSS:** Bonsai (native-IFC), FreeCAD 1.0 | free | ⬜ — ecosystem allies feeding clean IFC |

*Verdict:* authoring is defensible incumbent turf. Sentinel's job is to make **IDS validation of authored output a monetizable gate** ("prove your Revit export meets the EIR") — a pain every project has.

### Coordination · clash · QA/QC — *Sentinel's sweet spot* 🎯
| Tool | Cost | Web? | Sentinel |
|---|---|---|---|
| **Navisworks Manage** (clash + TimeLiner) | ~$2,605–2,740/yr | desktop | 🟡🎯 clash→BCF + web viewer |
| **Solibri** (model check + IDS) | €99 → €2,772/yr tiers | desktop (+young WebChecker) | 🟡🎯 IDS validation |
| **Revizto** (issue tracker + clash) | ~$450 → $3,000+/yr | desktop+cloud | 🟡 live BCF + clash |
| **BIMcollab** (Nexus/Zoom, BCF+IDS) | free plugins → ~€25/user/mo | Nexus web / Zoom desktop | 🟡 closest philosophical twin |
| **Verifi3D → Solibri CheckPoint** | folded in, now "legacy" | web | 🟡 **orphaned web-checking niche** |
| ACC Model Coordination | ~$900–1,284/yr/seat | web | 🟡 CDE + clash |

### The Revit data/parameter plugin layer — *replicate, don't monetize*
| Tool | Cost | Sentinel |
|---|---|---|
| **Ideate** (BIMLink/Explorer…) | from ~$1,495/yr bundle | 🟡🎯 web parameter/data management |
| **DiRoots** (SheetLink/ParaManager/ProSheets) | **free / freemium** | 🟡 — proves this layer commoditizes to $0 |
| **pyRevit** / CTC | free / quote | 🟡 — copilot + plugin-distribution template |
| Guardian (authoring-time protection) | $4,600/yr base | ⬜ — Sentinel gates at *exchange* instead |

### 4D scheduling — *clean gap: no browser-native mid-market 4D exists* 🎯
| Tool | Cost | Web? | Sentinel |
|---|---|---|---|
| **SYNCHRO 4D Pro** (Bentley) | ~€5,476/yr | desktop | 🟡🎯 4D timeline (+ fused 5D/6D) |
| Navisworks TimeLiner | in Manage/AEC Coll. | desktop | 🟡 |
| Fuzor (Kalloc) | ~$350–1,350/mo | desktop | ⬜ crew/equipment/VR sim |
| BEXEL Manager (4D/5D/6D) | €480 → €2,800/yr | desktop | 🟡 closest concept (auto-schedule from classification) |
| ALICE (AI generative scheduling) | ~$50–150k/yr | **web** | ⬜ |
| *Upstream:* Primavera P6 (~$2,500/yr), MS Project | — | — | **must ingest XER / MPP-XML** |

*Insight:* Sentinel can **auto-derive task↔element links from the same classification that drives its 5D cost** (the BEXEL route), giving near-free 4D — undercutting SYNCHRO/Navisworks' most labor-intensive step. Trimble **killed Vico (Jun 2024)**, orphaning location-based-scheduling users.

### 5D costing / take-off — *no web-native NRM/CESMM estimator exists* 🎯
| Tool | Cost | Web? | Sentinel |
|---|---|---|---|
| **RIB CostX** | quote (~AU$3–7k/seat) | desktop | 🟡🎯 model→BoQ (gap: revision-diffing, workbook engine) |
| **RIB iTWO / RIB 4.0** | enterprise quote | cloud | 🟡 estimating core |
| BEXEL Manager | €2,400/yr | desktop | 🟡 classification-driven QTO |
| Autodesk Takeoff → Forma Estimate | ~$1,250/yr → quote | **web** | 🟡 direct web competitor (RVT-gated) |
| Nomitech CostOS | enterprise quote | desktop | ⬜ **cost-loaded IFC export** (on-brand gap) |
| Kreo | $35–175/user/mo | web | 🟡 (2D-only; Sentinel beats on 3D) |
| Bluebeam Revu (2D takeoff) | $260–440/yr | desktop+cloud | ⬜ 2D PDF takeoff for unmodeled scope |

### CDE + project/doc management — *Sentinel IS this; every row COMPETES*
| Tool | Access model | ISO 19650 depth | Sentinel |
|---|---|---|---|
| **ACC → "Autodesk Forma"** | per-seat ~$1,284/yr | states = folders (faked) | ✅ compete — real state machine + audit is the edge |
| Trimble Connect | $12–29/user/mo | shallow | ✅ compete (low end) |
| **Aconex** (Oracle) | Unlimited/project | strong (immutable trail) | ✅ audit echoes it at a fraction of cost |
| **Asite Adoddle** | from $375/mo | **BSI Kitemark** state machine | ✅ mechanism parity — *gap is the badge, not the code* |
| Procore | ACV, unlimited users | weak (doc control) | ✅ validates unlimited-user pitch |
| **Catenda Hub** | unlimited/project | "100% ISO 19650" + full openCDE APIs | ✅ **closest architectural twin** |
| **Dalux** (Box+Field) | free viewer | real | ✅ **the viewer-performance bar to beat** |
| Bricsys 24/7 · Kroqi · Bimplus · Viewpoint · Newforma | unlimited / freemium / per-seat | weak→partial | ✅ mostly outclassed |

*Two credibility gaps, not engineering gaps:* **BSI Kitemark certification** (Asite/Viewpoint have it; it's procurement currency in UK/Gulf) and **a public BCF-API 3.0 + openCDE endpoint** (only Catenda serves the full family — Sentinel already runs the loop internally, just needs to expose it).

### 6D carbon + 7D FM / digital twins — *regulation is forcing this* 🎯
| Tool | Cost | Sentinel |
|---|---|---|
| **One Click LCA** | ~$15k–120k+/yr | 🟡🎯 6D carbon on governed data (gap: EPD database) |
| Tally / tallyCAT / **EC3** | ~$500/yr / free / **free** | 🟡 — *integrate EC3's open EPD API* |
| cove.tool / IES VE | ~$500/mo / quote | ⬜ energy simulation (partner, don't build) |
| Maximo / TRIRIGA / Archibus / Planon (IWMS/EAM) | six-figure quotes | ⬜ — **feed them COBie/IFC, don't fight them** |
| Autodesk Tandem / Bentley iTwin / Willow (twins) | per-facility / consumption / enterprise | 🟡 Sentinel plays iTwin's role on @thatopen/Supabase far cheaper |
| Zutec / gliderbim (golden-thread handover) | quote | 🟡 audit trail = native; gap: BSA Gateway templates |

*Differentiator:* carbon computed on the governed dataset **inherits the audit trail** — a regulator-defensible WLC number (EPBD 2028/2030, CALGreen 2026) no LCA silo can produce; and **handover = a permission change**, not a lossy one-time COBie export (the failure NIST priced at $15.8B/yr).

### Foundation & open-source stack — *know your ground*
- **That Open** (Sentinel's base): MIT/MPL — no copyleft on Sentinel ✅; healthy cadence but thinly funded → keep **fork-readiness**.
- **xeokit** = the road not taken: **AGPL** → would owe Creoox a license fee (the exact cost model Sentinel kills). Choosing That Open was correct.
- **Speckle**: best-funded OSS competitor (data-hub + Automate CI/CD), *not* an ISO 19650 CDE → differentiation holds; its connectors could feed Sentinel.
- **IfcOpenShell / IfcTester**: LGPL — usable for heavy backend IFC jobs + as the IDS reference to benchmark against.

### Emerging web-native challengers — *the trust layer is theirs to ignore*
Motif ($46M), Arcol (~$20M), Snaptrude (~$21.5M), TestFit ($22M), Higharc (~$80M), Hypar, Autodesk **Forma** — **all authoring/review/feasibility, none with governance/CDE/validation.** Kubity is dead; Omniverse retired its Launcher (viz-without-dataset cautionary tale). **Qonic** (ex-Bricsys, area-based pricing, buildingSMART 2025 award, "Information Manager" persona, "model quality hub" roadmap) is the **one convergence threat** — but still has no ISO 19650 state machine / audit. Sentinel's edge vs Qonic: formal 19650 workflow + immutable audit + standard IDS + live BCF + 5D/6D/7D on one dataset.

---

## 2. The cost a firm pays today (the pitch, quantified)

A mid-size coordinator/QS toolchain, per person, per year (list where public):

| Layer | Typical tool | ~Cost/yr |
|---|---|---|
| Authoring | Revit (or AEC Collection) | $2,915 (–$3,375) |
| Federation + clash | Navisworks Manage | $2,605 |
| Model checking / QA | Solibri Advanced | ~€2,109 |
| Issue tracking | Revizto / BIMcollab | ~$500–1,500 |
| Parameter/data | Ideate bundle | $1,495 |
| CDE seat | ACC / BIM Collaborate Pro | ~$1,284 |
| 4D (planners) | SYNCHRO Pro | ~€5,476 |
| 5D (QS) | CostX / iTWO | quote (~$3–7k) |
| 6D carbon | One Click LCA (org) | $15k+ (shared) |
| **Per-coordinator subtotal** | **6–8 apps + 2–3 clouds** | **≈ €12–18k/yr** |

Sentinel's integrated web platform replaces the **downstream spine** (viewer + clash→BCF + IDS + live BCF + 4D/5D/6D/7D + ISO 19650 CDE) at **one per-project subscription, unlimited users** — leaving only true authoring seats on the incumbent bill. *That* is the cost-reduction story, and it's credible because the pieces already exist in Sentinel.

---

## 3. Beachheads (moments of market dislocation to exploit)

- **Verifi3D / Solibri CheckPoint** — web-native model-checking, acquired and now "legacy" behind token-metered WebChecker → orphaned, price-sensitive customers mid-migration. *Sentinel's cleanest wedge.*
- **Trimble Vico (dead Jun 2024)** — location-based 5D/scheduling users with no successor.
- **Autodesk ACC → Forma rebrand** — public pricing withdrawn, quote-only bundles, deeper lock-in → the classic moment challengers gain.
- **Kubity dead / Omniverse Launcher retired** — viz-only plays without an owned dataset don't survive; reinforces "governed dataset first."
- **EPBD (2028/2030) + CALGreen (2026) + BSA golden thread** — regulation *forcing* auditable carbon + handover data, which only a governed dataset can defensibly produce.

---

## 4. Ranked target shortlist — what to deconstruct & replicate first

Scored on: client cost displaced × workflow pain × Sentinel already has a seed × web-feasible × trust-gap closable.

| # | Target(s) | Why first | Sentinel seed |
|---|---|---|---|
| **1** | **Solibri Model Checker (+ IDS)** | Compliance gold standard (€1.4–2.8k/seat); the web-checking niche was *orphaned* (Verifi3D/CheckPoint); regulation-driven demand | ✅ IDS validation (KF-B) |
| **2** | **Navisworks Clash Detective** (+ Revizto issue tracking) | The coordination default ($2.6k/seat), desktop-locked; clash noise is the #1 complaint | ✅ headless dedup'd clash→BCF |
| **3** | **SYNCHRO / 4D** | **No browser-native mid-market 4D exists** — genuinely open lane; auto-4D from the 5D classification | 🟡 4D timeline |
| **4** | **CostX / iTWO (5D)** | No web-native NRM/CESMM estimator; revision-diffing is CostX's moat to break | 🟡 model→BoQ QTO |
| **5** | **Ideate / DiRoots (parameter/data)** | High everyday pain; *replicate as a bundled feature, don't sell* (DiRoots proves it's a $0 layer) | 🟡 Properties + Browser |
| **6** | **One Click LCA (6D)** | Regulation deadline (EPBD/CALGreen); audit-trailed carbon is uniquely Sentinel's | 🟡 6D carbon |
| — | **CDE set (ACC/Catenda/Dalux)** | Sentinel *is* a CDE — competitive positioning, not deconstruction; close the **Kitemark** + **public BCF-API** gaps | ✅ CDE |

**The trust-gap protocol (applies to every target, per Gemini's point + our thesis):** for each replicated tool, ship a **"verify against your legacy export"** feature — Sentinel's clash list vs. a Navisworks NWD export; its IDS result vs. a Solibri report; its quantities vs. a Revit schedule / CostX BoQ. When a client watches the open web tool *prove its own numbers match the tool they already trust*, the liability fear that sustains the subscription collapses. This is the same **Governed Element Graph / "referee" wedge** from the strategic review, applied per feature.

---

## 5. Next step

Run the **deep 4-section feature-deconstruction** (per Gemini's framework + a 5th "Sentinel's unfair advantage" section) on the top targets — starting with **#1 Solibri/IDS, #2 Navisworks clash, #3 SYNCHRO 4D** — producing, per tool: functional backbone & logic → graphics feasibility in three.js/@thatopen → trust-gap mitigation spec → web implementation blueprint → the governed-dataset advantage. That converts this map into a build plan.

*Sources: ~90 cited vendor/analyst URLs across the eight research streams, retained in the scan transcripts.*
