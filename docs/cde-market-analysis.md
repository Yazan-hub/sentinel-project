# Web-Native OpenBIM CDE — Market Analysis & Opportunity Map

*Prepared 2026-07-16 for the Sentinel product team (Revit plugin + That Open/fragments web app) building a CDE. Every non-obvious claim is cited. buildingSMART runs **no** BCF/OpenCDE certification program, so all "OpenCDE/ISO 19650-compliant" vendor claims are self-declared unless noted.*

---

## 1. Executive Summary

The CDE market splits into three archetypes, each with a structural weakness a web-native OpenBIM CDE can exploit:

- **Document-control incumbents** (Aconex, Viewpoint For Projects, Asite, ProjectWise, Procore) — mature ISO 19650 transmittal/audit machinery, but **model viewing is bolted on, UX is dated/slow, pricing opaque, OpenBIM (live BCF-API, IFC round-trip) weak or absent**.
- **Vendor-anchored BIM clouds** (Autodesk ACC/BIM 360, ProjectWise, Bimplus) — deep native authoring-tool gravity, but **closed, lock-in-prone, and web viewers choke on large federated models** (Autodesk's own fix is "split the model").
- **OpenBIM-native challengers** (Catenda Hub, Newforma Konekt, Dalux, Trimble Connect) — genuine IFC/BCF/OpenCDE support and web-native viewers, but **small ecosystems, shallow lifecycle breadth (no cost/carbon/QA), and often incomplete ISO 19650 state machinery**.

**No platform unifies (a) a genuinely web-native large-model viewer, (b) real ISO 19650 container-state governance with an immutable audit trail, (c) OpenBIM/OpenCDE interoperability, and (d) the 4D–7D + QA + tender lifecycle in one governed dataset.** That white space is Sentinel's opening.

### Top 5 opportunities (impact × feasibility)

1. **Metadata-driven, immutable ISO 19650 container states + object-level audit trail** — not folders, not editable-after-the-fact. Most-corroborated gap: BIM 360/ACC fakes states with folders and lets users edit prior-version metadata ([Autodesk forum](https://forums.autodesk.com/t5/bim-360-support-forum/implementation-of-bim-360-s-custom-attributes-in-accordance-to/td-p/9631914); [BIMcorner](https://bimcorner.com/cde-within-iso-19650-a-process-or-a-solution/)). UK golden-thread/BS 8644-1 pressure makes it urgent. Sentinel's `gates.ts` already models stage gates — extend to container states.
2. **True web-native viewing of large federated models without splitting** — Autodesk's KB advises separating NWDs to load ([Autodesk KB](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Long-loading-times-and-slow-BIM-360-browser-viewer-performance-of-specific-RVT-models.html)); Trimble degrades past ~2,500 object links ([Trimble](https://docs.3d.connect.trimble.com/application-settings/display-performance)). Sentinel already runs Fragments (IFC→.frag, >10× faster).
3. **OpenCDE/BCF-API interoperability + one-click owner handover/archive** — even BIM 360→ACC migration drops issues/RFIs/audit logs ([Symetri](https://www.symetri.co.uk/insights/blog/migrate-multiple-projects-between-bim-360-and-acc-what-you-need-to-know/)); owners fear lock-out. Sentinel already ships a BCF-API 3.0 subset.
4. **Unified lifecycle dataset (issues + cost + carbon + QA + tender on the model)** — "no single platform serves as a single source of truth for the entire lifecycle" ([BIMcorner](https://bimcorner.com/cde-in-practice-what-tools-to-use-and-when/)). Sentinel already has 5D/6D/QA/BCF/RFI/tender as views on one element graph.
5. **Transparent, unlimited-external-user pricing** — sharpest repeated complaint is the *cost of merely granting access* (Procore per-project, ACC seat traps, Aconex "extremely expensive"). Catenda/Dalux/Bricsys prove unlimited-user works.

---

## 2. Platform-by-Platform Assessment

**Legend:** ✓✓ strong · ✓ present · ~ partial/bolt-on · ✗ weak/absent

| Platform | Web viewer | OpenBIM (IFC/BCF/OpenCDE) | ISO 19650 depth | Access model | Pricing | Biggest weakness |
|---|---|---|---|---|---|---|
| **Autodesk ACC / BIM 360** | ✓ APS Viewer, server-side SVF2; slow on big federated | ~ file BCF; **live BCF-API + OpenCDE Docs unconfirmed** | ~ Kitemark, but states=folders, **metadata editable**, suitability manual | 3-tier, easily misconfigured | opaque, quote | fragmentation, lock-in, Desktop Connector sync failures |
| **Trimble Connect** | ✓✓ true WebGL, IFC 2x3/4/4.3 | ✓✓ **live BCF 2.1+3.0 API** — cleanest of the big players | ~ no formal cert; lighter than Viewpoint | free tier + Business unlimited | ✓ **transparent** | slows >2,500 object links |
| **Bentley ProjectWise** | ~ desktop-heavy; Web View read-only | ~ IFC via iTwin; BCF-API unconfirmed | ✓✓ mature state/workflow engine + audit | ✓✓ state-level | ✗ most opaque | MicroStation-centric, steep, slow |
| **Oracle Aconex** | ~ browser + some plugins | ~ IFC4 + BCF (1.0/2.0 refs — dated?) | ✓✓ **best-in-class transmittals/audit** (immutable IDs) | ✓✓ neutral multi-party | ✗ expensive | sluggish dated UI, not model-first |
| **Asite (Adoddle)** | ✓ web viewer | ~ IFC; BCF/OpenCDE unconfirmed | ✓✓ enforced 4-state + sign-off + naming + audit | ✓✓ container-level | ~ $15–25/user+ | poor day-to-day UX/perf |
| **Procore** | ✗ proprietary convert via desktop plugin; ~2GB/tab | ~ IFC import; **BCF import only** | ~ doc-control, not native states | ✓✓ mature RFIs/submittals | ✗ **notorious** ACV, 10–14%/yr hikes | BIM is a bolt-on to a PM tool |
| **Dalux (Box+Field)** | ✓✓ fastest large-model/mobile | ~ IFC + native plugins; file BCF | ~ Shared/Published emphasized; WIP/Archived+codes less evidenced | ✓ unlimited invited even free | ✓ **free tiers** | Revit-centric ingest; metric-only |
| **Viewpoint For Projects** | ~ browser IFC viewer, dated | ~ BCF export; no OpenCDE | ✓✓ real revision/transmittal/naming/audit | ✓✓ robust | ~ project-value bands | sluggish, "Windows 98" UX |
| **Newforma Konekt** (ex-BIM Track) | ✓ web 2D/3D | ✓✓ **BCF REST API + server** | ~ coordination-centric; full states not evidenced | ✓✓ shares with unlicensed externals | ✗ quote | Konekt still maturing |
| **Kroqi** (CSTB) | ✓✓ WebGL (BIMData/xeokit), 100k+ objects | ~ IFC + BCF export | ~ GED + RBAC; suitability depth less evidenced | ✓ fine-grained RBAC | ✓ free/€50/€120 | small French-market ecosystem |
| **Catenda Hub** (ex-Bimsync) | ✓✓ fully web-native | ✓✓ **native IFC/BCF; live Foundation+BCF OpenCDE APIs** | ✓ strong claim; public docs don't enumerate states/codes | ✓ role-based, **unlimited users** | ~ quote | **scale** — tiny vendor (~150 customers), no cost/QA breadth |
| **Allplan Bimplus** | ~ web+desktop hybrid | ✓ IFC 2x3/4/4.3; **BCF 2.0/2.1 + API** | ~ partial/unclear | ✓ tiered | ✓ free 2GB → 4 tiers | niche Nemetschek orbit |
| **Bricsys 24/7** (Hexagon) | ✓ streaming, 70+ formats | ~ BCF on BricsCAD side, not 24/7 | ✓ strong doc-CDE + audit | ✓ **unlimited users** | ✓ ~$200/mo | thin coordination/BCF |
| **Revizto** | ~ **desktop-first** game engine | ~ **file BCF only**, no live API | ✗ coordination tool, not a 19650 CDE | ✗ per-license | ✗ quote, expensive | cost; not a CDE; high HW |

**Cross-reads:** Only **Trimble Connect, Catenda, Newforma Konekt, Bimplus, Dalux, Aconex** clearly expose a **server-side BCF-API** (per Solibri's Live Connector list — [Solibri](https://www.solibri.com/integrations)). Procore/Revizto/Bricsys/(unconfirmed ACC) are **file-based BCF only**. **IFC round-trip fidelity is undocumented across every platform** — industry-wide gap; best practice is *link/reference, don't round-trip*.

---

## 3. Catenda / OpenCDE Deep-Dive (the OpenBIM benchmark)

Catenda runs natively on IFC+BCF and ships **live OpenCDE APIs** (Foundation + BCF at `api.catenda.com/opencde/`) plus Document/Model/Project/Topic/Webhook APIs ([developers.catenda.com/bcf](https://developers.catenda.com/bcf)); recently added an "ISO 19650 status workflow" ([Catenda](https://support.catenda.com/en/articles/9874698-new-status-workflow-iso-19650)). **Its ceiling is scale and breadth, not standards** — ~30–48 people, ~150 customers ([Apollo](https://www.apollo.io/companies/Catenda-AS---makers-of-Bimsync/54a133f269702d2db4de3300)); lacks cost/field/QA/RFI/tender breadth — **exactly Sentinel's existing strengths**. Treat "100% ISO 19650" as unverified at feature level.

**OpenCDE landscape — real for BCF, aspirational for Documents:**
- **BCF (file + API)** is genuinely pervasive; server BCF-API (2.1/3.0) a solid mid-tier club. **Real and adopted.**
- **OpenCDE Foundation + Documents API** are real specs with thin mainstream adoption — confirmed implementers are small/open (CDE 19650 Cloud, usBIM, buildagil). **No evidence ACC/BIM 360 implements OpenCDE Documents** ([cde19650](https://www.cde19650.com/opencde-api)).
- Bottleneck is **commercial, not technical** — portability eases customer exit, so incumbents "talk more than they ship" ([AEC Magazine](https://aecmag.com/features/towards-open-aec-systems/)).
- **Critically: OpenCDE does NOT cover the ISO 19650 state model.** It standardizes document transfer + BCF exchange *between* CDEs; it does not define/enforce WIP/Shared/Published/Archived gates or suitability codes. **Shipping the state model is a genuine product differentiator, not a commodity standard.**

**Adjacent enablers to adopt:** **IDS** (bSI, 2023 — computer-interpretable info requirements; checks data not geometry — complements Sentinel's rule engine); **bSDD** (classification/property vocabulary); **web-ifc/Fragments** (already the stack — honest limit: runtime IFC parse too slow for prod, hence .frag pre-conversion; entity coverage a WIP).

---

## 4. ISO 19650 CDE Requirements Checklist + How Tools Measure Up

*(S0–S7/A/B code set is the UK National Annex, not base ISO — don't score non-UK projects against the exact letters.)*

| # | Requirement | Market reality |
|---|---|---|
| 1 | **Four container states, access-gated** (WIP→Shared→Published→Archived) | **Mostly faked with folders.** Asite/Viewpoint/Dalux Box/ProjectWise genuinely enforce; ACC/BIM 360 uses folders + manual moves |
| 2 | **Gate approvals to transition** (check/review/approve; authorization) | Strong in Aconex/Asite/Viewpoint/ProjectWise; manual/absent in ACC, Procore, Revizto |
| 3 | **Suitability/status codes as first-class metadata** | **BIM 360 "lacks suitability codes, necessitating manual input"**; native in doc-control CDEs |
| 4 | **Revision codes (P/C+.NN); supersede, not overwrite** | Documented scheme; enforcement varies |
| 5 | **Naming convention validated at upload** | Enforced by Asite/Viewpoint/Dalux/Bricsys; ACC/StreamBIM don't |
| 6 | **Transmittals (immutable, exportable)** | **Aconex best-in-class**; weak/manual in model-first tools |
| 7 | **Immutable audit trail; published = read-only** | **Named weakness in BIM 360** (editable prior-version metadata) |
| 8 | **Role-based perms (appointing/lead/appointed party)** | Present but "fiddly"; external bypass common |
| 9 | **Open-format handover (COBie/IFC/BCF/IDS)** | **Acute failure** — even ACC→ACC loses audit history |
| 10 | **CDE-to-CDE interop (OpenCDE)** | BCF yes; OpenCDE Documents thin |

**Bottom line:** the market bifurcates — **doc-control CDEs nail 1–8 but have weak model viewing/OpenBIM; model-first CDEs nail viewing/OpenBIM but bolt on or skip the state machinery.** A tool doing *both* rigorously **does not exist**.

---

## 5. Cross-Cutting Problems (evidence-backed)

1. **Vendor lock-in / weak OpenBIM** — major firms' open letter cites "70%+ increase in Revit cost of ownership," "poor commitment to open interoperability... feel trapped" ([AEC Magazine](https://aecmag.com/bim/letter-to-autodesk-aec-customers-demand-better-value/)). BCF round-tripping fragile — Autodesk's BCF importer "did not operate reliably."
2. **Rigid/bolt-on/missing ISO 19650** — "states faked as folders" produces "*apparent* compliance... lacking the accountability ISO 19650 mandates" ([BIMcorner](https://bimcorner.com/cde-within-iso-19650-a-process-or-a-solution/)).
3. **Weak/plugin-dependent web viewing** — vendors' own docs: ACC big models "don't load," fix is "separate the NWDs"; Trimble past 2,500 links; Procore ~2GB ceiling → partition.
4. **Fragmented/siloed data** — "no single platform... entire lifecycle" ([BIMcorner](https://bimcorner.com/cde-in-practice-what-tools-to-use-and-when/)); single-source-of-truth "reality or myth" ([AEC-Business](https://aec-business.com/the-single-source-of-truth-in-construction-projects-reality-or-myth/)).
5. **Poor authoring-tool linkage** — Desktop Connector "doesn't sync all files," locks Revit links; cloud worksharing overwrites work at 7–10 concurrent users. Plugin sprawl structural (Revit API breaks yearly).
6. **Access-control complexity** — BIM 360 perms easily misconfigured; ACC seat traps charge for external members.
7. **Expensive/opaque licensing** — Procore ACV-based, 10–14%/yr hikes; sharpest pain is **cost of granting external access**.
8. **CDE-to-CDE handover** — even BIM 360→ACC "does not migrate event logs/timestamps"; owners want a "package up all data" action that doesn't exist.
9. **Real-time collab/notifications** — Procore notification overload (can't disable some); **no CDE offers Google-Docs-style live co-editing of model data**.

**Tool-connectivity realism ("connect to everything"):** open standards (IFC+BCF+OpenCDE) give **broad, shallow, async** reach cheaply; native plugins give **rich, fragile, narrow** reach. **True bidirectional parametric live sync with every tool does not scale** — Speckle (whose business *is* connectivity) reframes "interoperability → connectivity" because each app has a proprietary API and no shared data model ([Speckle](https://www.speckle.systems/blog/the-future-of-data-exchange-from-interoperability-to-connectivity)). **Realistic target: an open-standards backbone (IFC ingest + BCF + IDS + bSDD + OpenCDE docs) for the long tail, plus native plugins for the dominant tools (Revit, Navisworks, Tekla, ArchiCAD, Civil 3D), scoping "sync" as publish/reference + issue round-trip, not live parametric editing.**

---

## 6. Ranked Opportunities + Sentinel Gap Analysis

### 6a. What Sentinel already has (verified in the codebase) — ~40% of a CDE foundation
BCF service (OpenCDE BCF-API 3.0 subset), project store, RFIs, tenders, standards-pack marketplace, RIBA-style stage gates (`gates.ts`), web-native fragments viewer, QA rule engine + scorecard + delivery gate, 5D cost / 6D carbon / 7D COBie, in-browser IFC writer, and the Revit plugin connector (C#, QA + IFC export + BcfSyncManager). **Uniquely spans coordination + governance + 5D/6D + tender — which Catenda/Newforma lack.**

### 6b. What's missing to be a real ISO 19650 CDE

| Missing capability | Severity |
|---|---|
| **Container states** (WIP/Shared/Published/Archived) with state-gated access | 🔴 Critical — `gates.ts` is *project stages*, not *container states* (different axis) |
| **Suitability/status codes** (S0–S7, A/B) as gating metadata | 🔴 Critical — absent |
| **Transmittals** (recipients, purpose, suitability, immutable) | 🔴 Critical — absent |
| **Roles/parties** (appointing/lead/appointed) + role-based auth | 🔴 Critical — no party/role model or auth |
| **Immutable audit trail** from ingestion; published = read-only | 🟠 High — JSON stores have `updated_at` only |
| **Revision control** (P/C+.NN) + naming validation | 🟠 High — absent |
| **Multi-tenant, concurrent, durable persistence** | 🟠 High — single-project permissive-CORS JSON files |
| **OpenCDE Documents API + one-click handover bundle** | 🟡 Medium — have BCF-API; need Docs API + COBie/IFC/BCF/IDS archive |
| **IDS import/export; bSDD classification** | 🟡 Medium — rule engine exists; IDS makes it interoperable |

### 6c. Ranked opportunities

**Tier 1 — build now (high impact, high feasibility on existing blocks):**
1. **Container-state engine + suitability codes + immutable audit trail.** Per-container state machine (WIP→Shared→Published→Archived), state-gated access, S0–S7/A/B codes travelling with the container, gate approvals, **append-only tamper-evident audit log**, Published immutable. `gates.ts`'s "standards-as-code at every boundary" extends naturally. *High feasibility.*
2. **Roles/parties + multi-tenant persistence + transmittals.** Postgres-backed multi-tenant store; appointing/lead/appointed roles; transmittal generation + immutable record (the Aconex strength nobody in OpenBIM matches). Team already flagged "Swap file store for Postgres (Module 2)."
3. **Large-federated-model web viewer as headline.** Lean into Fragments pre-conversion; market "view the whole federated model in-browser, no splitting, zero license."

**Tier 2 — differentiators:**
4. **Unified lifecycle dataset** (issues+cost+carbon+QA+tender as views on one element graph) — the anti-silo pitch; mostly integration/persistence.
5. **OpenCDE interop + one-click owner handover** (Foundation + Documents API; handover bundle = IFC+BCF+COBie+IDS+transmittal register+audit log). Being an *open* CDE owners can leave is a trust differentiator incumbents won't match.
6. **IDS-native standards packs + bSDD** — import/export IDS so standards-as-code interoperates with Solibri/Archicad.

**Tier 3 — strategic:**
7. **Transparent unlimited-external-user pricing** (open-core viewer/BCF free → SaaS for governed spine). Business decision.
8. **Frictionless Revit-plugin publish/BCF-sync + honest connectivity scope** — broad IFC/BCF ingest for the long tail, native plugins only for dominant tools; do **not** promise live parametric multi-tool sync.

**Sharpest single wedge:** Tier-1 items **1+2** turn Sentinel from "a viewer with BCF" into a **real ISO 19650 CDE with an immutable golden-thread audit trail** — the one thing the OpenBIM-native camp (Catenda, Konekt, Dalux) does *not* rigorously ship, and the doc-control camp (Aconex, Asite, Viewpoint) ships only on dated, non-web-native, non-OpenBIM foundations. Sentinel can be the first to do **both** — web-native OpenBIM viewer + rigorous 19650 governance + 5D/6D/QA/tender breadth — in one governed dataset.

---

## 7. Key uncertainties to verify before betting
- Whether ACC exposes a **certified live BCF-API server** vs file-based only (file confirmed; live API unconfirmed).
- **OpenCDE Documents API** adoption by any major incumbent (evidence: only small/open players).
- Exact **render engines** for Asite/Dalux/Viewpoint/Konekt; **BCF versions** in Catenda's API; Catenda's concrete state/suitability/transmittal features (marketing-level only).
- **IFC round-trip fidelity** everywhere (undocumented industry-wide).
- Enterprise **pricing** for ACC/ProjectWise/Aconex/Asite/Procore is directional (quote-driven).

*(Full source list — ~120 cited URLs across standards/OpenBIM, ISO 19650, and every platform — retained in the research transcript.)*
