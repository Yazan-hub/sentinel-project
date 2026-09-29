# Automating 3D models in Revit: market research and Sentinel vision

Research date: 2026-09-30. Written for the Sentinel founder.

This report is built from nine research streams:

- a code read of Sentinel;
- the founder's shared posts, in two batches;
- five market streams: drawings, images/text/scans, concept to DD, agents/MCP, and open source/academia;
- two LinkedIn sweeps.

A second, skeptical pass checked every stream. Anything that pass rejected has been left out.

**The short version**

- Many tools can now make a Revit concept from a drawing, a photo or a prompt.
- Almost none can take that concept to a DD model. By a DD model we mean one built from your office's own types, checked against the project's rules, and signed off.
- Sentinel's modelling today is honest and governed, but small. It builds walls, slabs and loose symbols from DWG, a box from photos, and four element kinds from AI proposals.
- Measured accuracy is 60–85% on real drawings, and every tool still needs a human to fix the rest.
- The best place for Sentinel is **governed model progression** ("Promote"): take any concept model and raise it to LOD 300 by the office standard, with a check and a receipt for every element.

---

## 0. How to read this

**Maturity labels**

- **SHIPPING**: you can download or buy it today.
- **BETA**: public beta, early access or a waitlist. Also any internal pilot. All Sentinel tools are BETA because they are not sold yet.
- **DEMO**: only a video or a post. You cannot use it yourself.
- **RESEARCH**: a paper or a code repository.
- **UNKNOWN**: the sources were not enough to decide.

**Sources**

- Every table row has a link, opened by a researcher on or before 2026-09-30.
- "Vendor claim" means only the seller says it.
- "Not re-verified" means the second checker did not open that source again.
- Prices appear only when the source states them.

**Words used in the tables**

- *Native typed*: real Revit walls, floors, roofs or families, each with a real type.
- *Native generic*: real Revit elements with placeholder types (for example "Generic 200 mm" or "HyparDoor").
- *Via IFC*: you get an IFC file and import it. Office types are lost.
- *Mesh / DirectShape*: looks right, but cannot be edited like BIM.

**LOD levels used here**

- LOD 100 = massing.
- LOD 200 = generic elements, approximate size.
- LOD 300 = the office's real types and build-ups, correct size and position.
- LOD 350 = LOD 300 plus interfaces (hosting, joins, connections).

**Earlier work.** The 2026-08-07 showcase note (docs/research/2026-08-07-ai-revit-showcase-analysis.md) proposed a propose-gate in front of AI writes to Revit. That now exists as **Review AI Proposals**, so this report does not repeat the note.

---

## 1. Sentinel today

**In one sentence:** Sentinel turns clean DWG linework into levels, grids, walls, floors, ceilings and loose family symbols, and turns photos into a rectangular box. A person ticks every write. Nothing upgrades a model from LOD 200 to LOD 300 in geometry or type.

### 1.1 What each tool really builds

| Tool (ribbon) | What it creates in Revit | Real LOD | Input | AI used | Live evidence | Cannot do |
|---|---|---|---|---|---|---|
| **1 · Datum from Drawings** | Levels. Straight grids (1..N one way, A.. the other way) | Datum only | DWG/DXF: a section with lines on a LEVEL/LEVL layer, and a plan with a GRID layer | None. Pure 2D geometry | SIM 3.9: 11 grids and 14 levels from two DXFs (F40 and F41 fixed). Also the 2026-07-26 chain run | No PDF or raster input. Heights come from line positions, never from level text. Layer words are hard-coded. Arc grids are probably dropped (not re-verified) |
| **2 · Ghost Builder** | Basic walls (paired faces become a centreline). Floors and ceilings from closed loops. *Unhosted* door, window, column and furniture instances. 7 categories in total. Spec values are written to parameters | Labelled "LOD 200". In reality: walls and slabs on one level, plus loose symbols | DWG/DXF plan. Optional spec PDF or text (up to 6,000 characters). Up to 4 images, used as hints only. Office artefacts layers@n, guideline@n, type_catalog@n | Local qwen2.5:7b-instruct maps layers, but only after the standard, the cache and the heuristics have all failed. Local llava reads images as hints | Placement proven only on the 10 × 7 m ghost-sample (2026-07-23 and 2026-07-26). SIM 3.9 gave an honest empty proposal (F45). B7 did not run the build live | Doors and windows do not cut walls. Walls default to 10 ft high. No roofs, stairs, curtain walls, rooms, openings or railings. Joins are not handled (from the audit, not re-verified) |
| **Type engine** (GuidelineMatcher, GhostTypeCreator, provisioners) | Picks the office wall or floor type from the measured thickness. If the office has no type at that size, it creates one from a catalogue sibling, or reports a *named gap* | Walls and floors only | Thickness, CAD layer, level, guideline@n, type_catalog@n | None. A deterministic port of guideline.ts | Proven in the test harness. The catalogue-gap rows were not run live in B7 | Works only at placement time. Cannot retype a model that already exists |
| **2b · Photo Massing** | A rectangle of real Basic Walls, plus one floor per storey. Uses the guideline wall type where one exists (in SIM: BDS_EXT_ARC_CMU_200 mm) | LOD 100 | Photos in the Ghost source folder | llava estimates width, depth, storeys and storey height. Values are clamped. Fields at or below 0.35 confidence are marked "assumed" | SIM 3.9: first runs placed 0 elements, and 150 after fixes. F46: four photos of a 38-storey tower gave a 2 m footprint, 23 storeys and a 2.1 m storey | The run record calls it "a rectangular envelope from four numbers, never a likeness". No roof, no real footprint, and it does not use the model's existing levels |
| **3 · Annotate Views** | Empty WIP floor and ceiling plans for each level | Not modelling | Levels, plus the views section of guideline@n | None | 24 views on 2026-07-26. SIM 3.9 marked it a fail (F44) | Annotates nothing |
| **Review AI Proposals** (MCP `sentinel_propose_changeset` → ChangesetExecutor) | Levels, straight grids, straight Basic walls (type chosen by name), single-loop floors | LOD 100–200 | JSON from any MCP agent. Each element needs an IFC class. At most 200 elements per changeset | External: whichever agent sends the proposal | Live on 2026-08-07. Passed in SIM | The vocabulary is only wall, floor, level and grid. No preview before commit (from the audit, not re-verified) |
| **Fix in Revit** (FixInPlaceService) | Parameter values on existing elements, taken from IDS issues | The information (LOI) half of LOD 300/350 | IDS verdict issues, plus a person's ticks | None | SIM row 3: the IDS rejected 42 doors, 42 of 42 were fixed, and a receipt was written | No geometry and no type swaps. It never adds a parameter |
| **Build/Load Office System** | Binds the office's shared parameters and worksets into a model | Preparation for DD | Office standard | None | — | Creates no geometry |
| **MEP Openings** | Void families where linked MEP crosses walls, floors or framing, or a BCF topic instead | — | Host model plus an MEP link | None | Never run live (SIM 3.8 had no MEP link) | — |

Code and records read for this table: SentinelAddin/Commands.Datum.cs, GhostBuilder/DatumFromDrawing.cs, Commands.GhostBuilder.cs, GhostBuilder/ElementPlacementFactory.cs, WallPairing.cs, GhostTypeCreator.cs, MassingPlanner.cs, Commands.Massing.cs, Commands.Annotate.cs, Coordination/FixInPlaceService.cs, Commands.Phase2.cs, WebApp/bridge/mcp-server.mjs, changesets-logic.mjs, GhostBuilder/ChangesetExecutor.cs, docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md, docs/strategy/2026-09-30-revit-addin-audit.md and docs/handbook/05-capability-status.md.

### 1.2 The honest picture

- **Geometry API calls in the whole add-in.** Level, Grid, Wall, Floor, Ceiling, unhosted NewFamilyInstance, WallType/FloorType duplication, ViewPlan and one clash View3D. A code search finds no roof, stair, curtain system, room, DirectShape, duct, pipe, NewOpening, railing or toposolid creation.
- **Inputs.** Only vector DWG/DXF gives geometry. PDFs are read as text only. Photos become four numbers. The add-in has no path from a brief to a model.
- **AI.** The AI is small and local (qwen2.5 7B, llava). That is good for privacy but weak for reading drawings.
- **A governance gap inside Sentinel.** Builds from Datum, Ghost, Massing, Annotate and changesets write **no ledger row** yet; this was deferred as spec Decision 3. So the modelling chain sits outside Sentinel's own audit story.
- **Revit version.** Every live run was on the founder's Revit 2024. The market works on 2025–2027: Geopogo supports 2025–2027, and Autodesk's MCP server supports 2027 only.
- **LOD progression.**
  - For geometry and types: none.
  - For information: some. Fix in Revit writes IDS-required values onto existing elements (42 of 42 live).

### 1.3 What Sentinel already has that the market lacks

- **Typing from governed artefacts.** Office types come from guideline@n and type_catalog@n. When a type is missing, Sentinel reports a named gap instead of inventing a type.
- **A human tick before every write**, with one transaction and one Undo per action (commit 0c1425a).
- **An IDS gate** in front of proposals, plus IDS-driven parameter write-back.
- **A hash-chained ledger** that records the verified actor.
- **A shared web CDE** on That Open.
- **A specified modelling backlog**: GHB-1 (hosted openings), GHB-2 (level-to-level heights), MAS-2 (Mass DirectShape) and DAT-1..5.

---

## 2. The market map

Tools are deduplicated across the streams. Where a tool fits two categories, it sits in its main one and is cross-referenced.

### 2.1 DWG / PDF / raster plans → Revit

| Tool | Vendor | What it builds in Revit | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| WiseBIM AI for Revit | WiseBIM SAS (Paris) | Native typed. Single-layer walls (width bands mapped to types, with a cap on new types), doors, windows, floors, ceilings, rooms. One level per run | Cloud deep learning on a scaled underlay (DWG, DXF, PDF, PNG, JPEG, TIFF, BMP). Its system card says nothing is written without user validation. Customer data is used for training by default (opt-out needs a side letter) and kept up to 5 years | SHIPPING. Revit 2022–2027, v1.4.2 (2026-09-15), rated 4.3/5 from 16 reviews | $49/month, free trial | [Marketplace](https://marketplace.autodesk.com/apps?id=7792821748025964445), [system card](https://wisebim.app/legal/20260903_WiseBIM_AI_System_Card_v.1.pdf) |
| Plans2BIM | WiseBIM | Via IFC, plus DXF and CSV/XLSX quantities. Multi-floor | Same detector, as a web app | SHIPPING | €49/month or €299/year (May 2025) | [AEC Magazine](https://aecmag.com/bim/from-2d-to-3d-and-back/) |
| AmpliFY | iFY / INEX BET | An RVT file (Revit 2022 format), plus IFC and DWG. Walls, doors, windows, rooms, shafts, sanitary fittings, beds. A batch of plans becomes a stacked multi-storey model | Automatic scale reading, then ML detection. Custom Revit templates and naming. API since January 2026 | SHIPPING. Residential only. Heights are default values. Takeoff and in-app editing are still "coming soon", behind the vendor's own roadmap | Free web app; free preview before paid runs; no prices shown | [ify.inex.fr/amplify](https://ify.inex.fr/amplify), [ify.solutions](https://ify.solutions/) |
| Nexar Plan | Nexar Group (UK) | Native: walls, curtain walls, doors, windows, floors, stairs, ceilings, level by level. Rhino 3DM/GHX also becomes native elements, with DirectShape only as a fallback and with sync tracking | Reads CAD layers named to the AIA standard. Demo: 3 DWG sheets in 1 min 40 s | SHIPPING | £50/user/month, billed yearly (£600). Free Education licence | [nexar-group.com/plan](https://nexar-group.com/plan) |
| Bimify | Bimify (Stockholm) | RVT/IFC delivered to you. Stairs, railings, roofs and vertical openings are not modelled automatically | A service: AI detects, experts verify, rule checks validate | SHIPPING (as a service). API, Instant and Insight are "coming soon" | Fixed price per m². An area audit up to 5,000 m² costs €999 | [bimify.com](https://bimify.com/) |
| Bid BIM | ConstructAI | Native LOD 200 plus takeoff: walls, doors, windows, spaces | Vector PDF. Confidence score per element, bulk review, high-confidence items auto-approved. Free plugin for Revit 2025/2026 | DEMO. The product site did not respond on two tries | Video says: first project free, then $99 per project | [YouTube](https://www.youtube.com/watch?v=xItmOt-SfjA) |
| PdftoRvt | Pdftorvt | Native, inside the office's own template: levels, grids, walls, doors, windows, roof, floor, dimensions, sheets | An LLM reads a PDF, text or PNG sketch, and **asks** for missing facts (in the demo, the top-of-steel height). The vendor's team calibrates each office's conventions | BETA (private) | "Pay only if you approve the results" | [LinkedIn 2026-04-07](https://www.linkedin.com/posts/pdftorvt_bim-revit-aec-activity-7447317848315703296-YBJG) |
| Geopogo FloorPlan to 3D | Geopogo | Native walls, doors, windows, rooms, floors linked to rooms, furniture | Image AI, then you review the list of detected elements, then Build | BETA (R&D early access; page re-published 2026-09-29) | No price | [geopogo.com/rnd](https://geopogo.com/rnd), [video](https://www.youtube.com/watch?v=i_64LY-aAyA) |
| BIMxAI | BIMxAI | Via IFC | Web detection, then review, then export | BETA | Free tier; credit-based paid tiers | [bimxai.io](https://www.bimxai.io/) |
| 2BIM3.ai | 2BIM3 | RVT at "LOD 350–400 in 24 hours" (not a believable claim) | AI plus a QA service (vendor claim) | UNKNOWN. The team section on the site is placeholder template text | €2.20–3.00/m² | [2bim3.ai](https://2bim3.ai/en/) |
| Helix | EvolveLAB (now part of Chaos) | Native walls, doors, windows, railings, room separation lines, pipes. Also SketchUp to and from Revit | Layer mapping and centreline finding. Since v2.12, several types per layer, chosen by width | SHIPPING. Forum reports from 2024 of missed walls and openings | Not confirmed (the pricing page returns 404) | [evolvelab.io/helix](https://www.evolvelab.io/helix) |
| BIMify | AK Tools (not related to Bimify Sweden) | Native walls, columns, beams, doors, foundations, MEP | Pure layer mapping; mappings saved as JSON | SHIPPING. Revit 2022–2026, no 2027 yet | Free | [Marketplace](https://marketplace.autodesk.com/apps?id=4129344638186376552) |
| PARS-BIM Architecture Tools | PARS-BIM | Walls, doors, windows | Layer rules | SHIPPING (Revit 2024–2027) | $30/month (not re-verified) | [Marketplace](https://marketplace.autodesk.com/apps?id=1123320694988490058) |
| Line-pair utilities | EaseBit; BIM Soft Solutions; D'Bim Tools | Walls and floors from pairs of lines | Measures the gap between the lines | SHIPPING (older Revit versions) | $1.99/month; trials | [EaseBit](https://marketplace.autodesk.com/apps?id=6877579131676804491) |
| Bird Tools CAD Block Remapper | Building Information Researchers and Developers OÜ | Family instances at CAD block positions, with hosting | Reads blocks in the linked DWG | SHIPPING (Revit 2022–2027) | Free | [Marketplace](https://marketplace.autodesk.com/apps?id=45455101329559547) |
| BIMLOGIQ Copilot, block placement | BIMLOGIQ | Families at named CAD blocks | LLM prompt | SHIPPING | Not stated | [docs](https://bimlogiq.com/docs/copilot/articles/family-placement-automation) |
| Horizun DWG-to-BIM | Horizun Group (Colombia) | Typed levels, grids, walls, slabs, roofs, rooms, openings, stairs, structure, MEP runs. Every element is stamped with its CAD source. A revision update flags manual model edits for review | Requirement set, then plan, then rehearse, then apply, then audit. Source file hashes are checked | SHIPPING. Free, Apache-2.0, v2.1.4 (2026-09-28) | Free | [GitHub docs](https://github.com/HorizunGroup/horizun-revit-mcp/blob/main/docs/DWG-TO-BIM.md) |
| Hongwa BuildMaster | Shanghai Hongwa | Grids, columns, beams, walls, doors, windows, pipes. Also secondary structure and finishes | Layer rules plus reading of Chinese 平法 structural annotations | SHIPPING (Chinese standards) | A free edition is listed | [hwbim.com](https://www.hwbim.com/product/modeling4jianzhu) |
| DiRoots custom add-in for Kingspan Isoeste | DiRoots | Manufacturer walls, panels, doors, ceilings, structure, plus sheets | Layer selection | SHIPPING (built for one client) | Bespoke | [case study](https://diroots.com/custom-software-development/case-studies/auto-dwg-to-revit-conversion-kingspan-isoeste-custom-revit-add-in/) |
| Ideatura (DWG to model) | Ideatura | Native walls and openings, read from DWG vectors, blocks, text and dimensions | LLM plus a geometry engine | DEMO for this flow | Not disclosed | [video](https://www.youtube.com/watch?v=eazJTNQpxq0) |
| mytools-pyrevit, Create From CAD V2 | OdedCas | Walls, hosted doors and windows, partitions, slab, dimensions. Sketches handled through homography plus OCR | Deterministic, no LLM | RESEARCH (no licence file) | — | [GitHub](https://github.com/OdedCas/mytools-pyrevit) |
| Small demos | Tejas Mhaske; Mudit Jain (a comment only); RapidBIM; BIMARTIK Grids Manager; ADHOX; Mohamed Adel (2021 ML) | Walls, floors, openings; grids and levels; blocks become families with attributes | Mostly layer rules | DEMO / UNKNOWN | — | [Tejas](https://www.linkedin.com/posts/kristijan-vilibic_bim-revit-cadtobim-ugcPost-7485637627052797952-ZKSs), [RapidBIM](https://www.youtube.com/watch?v=XcETZ6yxk04), [BIMARTIK](https://www.youtube.com/watch?v=zk4tYAWaQDs) |
| Other BIM tools (not Revit) | BricsCAD BIM; Vectorworks; ACCA Edificius and usBIM.planAI (WiseBIM engine); GstarBIM; Glodon BIMMAKE; AutoCAD Smart Blocks (beta) | Assisted tracing in their own BIM, with RVT/IFC exchange | Snapping and wall thickness read from lines | SHIPPING / BETA | Licences | [BricsCAD](https://bricscad.octave.com/blog/bricscad-bim-v24-quickest-path-to-3d-from-2d), [ACCA](https://biblus.accasoftware.com/en/recognize-and-import-a-dxf-dwg-file-in-a-bim-project/) |
| Research and SDKs | CAD2BIM (an agent writes a spec with evidence, a deterministic exporter builds it); ISARC 2026 LLM plan-to-IFC; fpvec-lab (edit-cost metric); CADTransformer and SymPoint (vector symbol spotting); DeepFloorplan, RoomFormer, HEAT, CubiCasa5k; RasterScan (closed SDK) | IFC or 2D vectors | ML | RESEARCH (RasterScan is SHIPPING) | Free / licence | [CAD2BIM](https://github.com/alvin528/CAD2BIM), [fpvec-lab](https://github.com/Cyprinus12138/fpvec-lab), [RoomFormer](https://github.com/ywyue/RoomFormer) |

Autodesk itself: according to the researcher's reading, Revit 2027 and the AU 2026 announcements include no drawing-to-model feature. This was not re-verified.

### 2.2 Photos, images and sketches → Revit

| Tool | Vendor | What it builds in Revit | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Veras 5.2 Agentic Modeling | Chaos / EvolveLAB | Native walls, floors and roofs. Doors and windows as families. Compound objects as one family. Anything else becomes Enscape proxies | An agent on GPT-6 Astra or Claude Opus 5.5 compares its model with up to 12 source views and corrects it. Guessed elements carry a "?" marker that shows the assumption on hover. A deterministic bake (reusing about half of the Helix code) writes to Revit, Rhino or SketchUp | BETA (released 2026-09-24) | Free up to a credit allowance; first 4 models free until 2026-10-30 | [forum release](https://forum.evolvelab.io/t/veras-5-2-agentic-modeling-with-astra-opus/11479) |
| Geopogo Claude to Revit (photo and plan use) | Geopogo | Native walls, floors, roofs, doors, windows. Roof types and door/window families must already be in the model | MCP agent. Published photo workflow: isolate the building, make elevation references, give basic dimensions, then build | SHIPPING. Revit 2025–2027 | See 2.8 | [product page](https://geopogo.com/rnd/claude-to-revit), [video](https://www.youtube.com/watch?v=el4-33JC9mM) |
| Snap a Building (iOS) | Geopogo | Textured mesh (GLB/FBX). No BIM | Cloud reconstruction from phone photos | SHIPPING | Free app; paid credits for exports | [geopogo.com/ios-app](https://geopogo.com/ios-app) |
| GPT-6 Astra with community MCP servers | OpenAI model; tests by BIM Pure, Archi Vlogs, NowTech | BIM Pure's cabin was accurate but entirely DirectShape: "mostly useless as a model". Archi Vlogs' house used native walls, rooms, roofs and doors, took about 29 min and 340 credits, and had layout and opening errors. A single image gave 16 apartments with 327 walls, "according to the creator" (second-hand reshare) | Agent plus MCP (pyRevit MCP or BIMwright) | DEMO | Paid ChatGPT plan | [BIM Pure](https://www.bimpure.com/blog/revit-ai-tutorial-image-to-model-with-chatgpt-6-astra), [Archi Vlogs](https://www.youtube.com/watch?v=NFbMttBZBwo), [NowTech](https://www.linkedin.com/posts/nowtech1_the-ai-created-a-detailed-revit-model-from-activity-7504328097639518208-w5_q) |
| HMK Pilot AI (photo demo) | HMK Tools | One photo became an AutoCAD plan, then a Revit model (537 elements), then a Navisworks 4D sequence. The vendor calls it "a starting model, not a survey" | Agent plus MCP. Generated scripts run in a sandbox and are approved in chat | Product is SHIPPING (Revit 2023–2027); the photo flow is a DEMO | 14-day free trial | [video](https://www.youtube.com/watch?v=CQVMQXDcfVc), [hmktools.com](https://hmktools.com/revit-mcp) |
| STEF agentic plugin | Studio Tim Fu | Rhino geometry only | Agent on Astra. One measured dimension: 3 cm off on a 184 cm countertop, against 22 cm for an unnamed "legacy" model | BETA (private) | — | [LinkedIn](https://www.linkedin.com/posts/studio-tim-fu_breakthrough-with-astra-we-tested-photo-model-reconstruction-activity-7502327842152640513-ytJC) |
| photo-to-bim | Aleksei Kondratenko | Semantic IFC, about LOD 200. Interior floorplates are marked as assumptions | Blender and Bonsai driven through MCP. It measures landmark reprojection error against a 5 px tolerance, and all four recent examples exceed that tolerance | BETA (plugin 0.8.x) | Free, Apache-2.0 | [GitHub](https://github.com/alekseikondratenko/photo-to-bim) |
| ArchSmarter sketch-to-Revit | Michael Kilkelly | 19 walls, 7 doors, 16 windows and 12 rooms in 35 min, about 85% correct | A Claude skill writes JSON, a web viewer takes redline corrections, and a Revit add-in maps wall classes to template types | DEMO | — (a course) | [blog](https://www.archsmarter.com/blog/ai-sketch-to-revit-model) |
| Sketch2BIM | Ratul et al. | Walls and openings | An MLLM writes a JSON layout, a human gives feedback, a schema validates it | RESEARCH | — | [arXiv 2510.20838](https://arxiv.org/abs/2510.20838) |
| Ideatura reconstructions (Leadenhall Building) | Ideatura | Simplified, editable reference models. The vendor says they are "not construction-ready" | Frontier model plus human correction, step by step | DEMO | — | [video](https://www.youtube.com/watch?v=QAoKEbixqD4) |
| Blender MCP + Claude (Cognito test) | Chaitanya Bharech | Mesh, not BIM. Review found the stair needed cleanup and the doors were "not quite right" | Plan image plus one elevation | DEMO | — | [article](https://consultcognito.com/how-to-turn-a-2d-floor-plan-into-a-3d-model-using-ai-blender-mcp-claude/) |
| Higharc sketch recognition | Higharc | Higharc's own model; no Revit | AI plus an expert system | UNKNOWN (known only second-hand) | — | [AEC Magazine](https://aecmag.com/bim/from-2d-to-3d-and-back/) |
| Image-to-3D engines | Meshy, Tripo, Hyper3D Rodin, Kaedim; open weights: Hunyuan3D 2.1, TRELLIS.2, SAM 3D | Meshes only. In Revit they can be DirectShape at best | Diffusion or voxel models | SHIPPING (hosted) / RESEARCH (open weights) | Meshy and Tripo from $20/month (not re-verified) | [Meshy](https://www.meshy.ai/pricing), [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) |

Photo-to-model is also shown by Motif (browser BIM, see 2.5) and by Faizan Farooqui's local add-in (see 2.4).

### 2.3 Scans and point clouds → Revit

| Tool | Vendor | What it builds in Revit | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| EdgeWise Lite / Pro | ClearEdge3D | Native families for pipes, structure, ducts, conduit, cable tray and walls, with type and coordinates | Fit-to-spec extraction plus QA: a coverage sheet per element and a "remainder cloud" of unmodelled points (on the Lite page). Pro adds automatic extraction. Vendor: "up to 73%" of as-built modelling automated | SHIPPING | Lite $1,995/year | [EdgeWise Lite](https://www.clearedge3d.com/edgewise/edgewise-lite-point-cloud-to-revit-ready-as-built-modeling-just-1995-usd-year/) |
| Leica CloudWorx for Revit | Leica (Hexagon). IMAGINiT's old "Scan to BIM" page now redirects here | Native walls, floors, structure, pipes | You pick regions and the tool fits geometry | SHIPPING | "Request pricing" | [Leica](https://leica-geosystems.com/products/laser-scanners/software/leica-cloudworx/leica-cloudworx-revit) |
| aurivus | aurivus GmbH | An independent review saw LOD 100 walls, placed one by one. Interior walls may not connect | Neural segmentation of the cloud, then a Revit plug-in | SHIPPING | Not stated (a review calls it high) | [review video](https://www.youtube.com/watch?v=7OhgOokstbI) |
| ReCap Pro 2026 Scan-to-Mesh | Autodesk (PointFuse technology) | Classified mesh placed as Revit families. Not walls | Local meshing and segmentation | SHIPPING | Subscription | [Autodesk blog](https://www.autodesk.com/blogs/aec/2025/04/02/whats-new-in-recap-pro-2026/) |
| Matterport BIM Files | Matterport | LOD 200 RVT/IFC, delivered as a service | Service | SHIPPING | Add-on priced per space | [matterport.com/bim](https://matterport.com/bim) |
| XGRIDS LCC for Revit | XGRIDS (built with Autodesk) | Walls, doors and levels from Gaussian splats (vendor claim) | Works with XGRIDS' own capture hardware | UNKNOWN (App Store availability not verified) | — | [engineering.com](https://www.engineering.com/xgrids-debuts-ai-powered-3dgs-scan-to-bim-plug-in-for-revit/) |
| Pointorama | Pointorama | Via IFC or DXF | AI detection plus human review | SHIPPING | Trial | [pointorama.com](https://www.pointorama.com/) |
| Cloud2BIM-AI | ConstrIQ | Via IFC4, including curved walls | AI detection, then overlay review | SHIPPING | Charged at export only | [constriq.tech](https://constriq.tech/point-cloud-to-bim) |
| Twindo | Twindo (formerly Canvas) | RVT delivered from phone LiDAR scans | AI plus human modellers | SHIPPING (service) | Not disclosed | [twindo.com](http://www.twindo.com/) |
| FARO As-Built for Revit; Nest3D | FARO; Nest3D | Native elements, semi-automatic; linework plus walls | Fitting to picked regions | SHIPPING | Not stated; Nest3D has a trial | [third-party](https://www.thefuture3d.com/blog/ai-point-cloud-to-bim/), [Nest3D](https://www.nest3d.ai/revit-point-cloud-plugin) |
| Polycam; Scaniverse | Polycam; Niantic Spatial | Meshes, splats, DXF plans. No BIM | Phone capture | SHIPPING | — | [Polycam](https://poly.cam/solutions/architecture-engineering-construction) |
| Research | Cloud2BIM (CTU Prague); BIMStruct3D; A-Scan2BIM (predicts the next Revit API edit from a scan plus edit history) | IFC, or sequences of Revit operations | ML | RESEARCH | Open | [Cloud2BIM](https://arxiv.org/abs/2503.11498), [A-Scan2BIM](https://arxiv.org/abs/2311.18166) |
| Demos | Q.bit; CRXAI (cloud to AutoCAD via Codex); Prevu3D mesh to IFC; SORDI.ai (commenters say it retrieves library assets rather than modelling) | — | — | DEMO | — | [CRXAI](https://www.linkedin.com/posts/mustafa-al-adhami_ai-aec-scantocad-activity-7510429684111794176-Fxjr) |

### 2.4 Text / brief → BIM

| Tool | Vendor | What it builds | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Snaptrude | Snaptrude | From an RFP or prompt plus a site: a program, then massing, then BIM in one click, exported to Revit (see 2.5) | AI agents, then a deterministic mass-to-BIM step | SHIPPING | Free (3 projects), $60/month Individual, $100/month team tier (annual billing), Enterprise | [pricing](https://www.snaptrude.com/pricing) |
| DesignBuildAI | DesignBuildAI | Claims "construction-ready LOD 300" with architecture, structure and MEP from a prompt. No Revit link stated | Describe, generate, refine in the cloud | SHIPPING (the LOD 300 claim is unverified) | Free (300 credits); Solo $22/month on annual billing | [designbuildai.tech](https://designbuildai.tech/) |
| Geopogo text-brief demos | Geopogo | Full house floor plans from a long brief (Fable 5) | MCP agent | Part of a SHIPPING product | See 2.8 | [LinkedIn 2026-07-07](https://www.linkedin.com/posts/michaalhoppe3dfx_revit-autodesk-architecture-ugcPost-7480079062212730880-1SiD) |
| Cora Agent | Yuri Chamblas | Concept massing in Revit, LOD 100–200 | A planner, batch tools, a geometry check, then a critic | DEMO (64 views) | — | [video](https://www.youtube.com/watch?v=v1yux51sTtY) |
| Revit AI Prompt (local) | Faizan Farooqui | Simple elements; image or logo to a family (v2) | LM Studio with DeepSeek R1, then Gemma 4. Everything is placed at the same coordinates, and there is no action log | DEMO (free) | Free | [LinkedIn 2026-08-05](https://www.linkedin.com/posts/faizan-farooqui-4b6985160_from-imagetext-to-revit-model100-free-ugcPost-7490699924922085376-dDUt) |
| Research | Text2BIM (TUM, with a checker loop); BIMgent (GUI agent, 32% operation success); HarnessBIM (IFC4, 9 checkers that emit BCF); Text2BIM Self-Verification (IDS + IfcTester); MCP4IFC; IFCX MCP; KIR (a typed intermediate language lowered to Revit); BIM-Edit benchmark | IFC or native | Code generation with verifiers | RESEARCH | Open | [Text2BIM](https://arxiv.org/abs/2408.08054), [KIR](https://arxiv.org/abs/2609.14578), [BIM-Edit](https://arxiv.org/abs/2606.20146), [HarnessBIM](https://github.com/ReverseZoom2151/harnessbim) |

### 2.5 Concept and massing platforms (and how they reach Revit)

| Tool | Vendor | What reaches Revit | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Forma Building Design | Autodesk | One-way export of a geolocated .rvt (Revit 2025/2026/2027). Walls, slabs, windows and roofs "as Revit elements in generic families". AEC Magazine: aimed at LoD 200 | Cloud design automations for facades, plans and units | SHIPPING (launched 2026-04-07) | Included with the AEC Collection, Revit subscription or Forma bundle | [Autodesk blog](https://blogs.autodesk.com/forma/2026/04/14/connect-your-design-workflows-with-forma-building-design/) |
| Forma Site Design + Load Proposal | Autodesk | Basic 400 mm walls, 225 mm roofs, 100 mm floors, a toposolid, context as groups | Revit add-in maps to fixed generic types | SHIPPING | Included | [Autodesk blog](https://blogs.autodesk.com/forma/2026/02/03/how-to-send-your-forma-site-design-proposal-to-revit/) |
| Building Layout Explorer (neural CAD) | Autodesk | Layout options inside Forma | Foundation model | BETA (closed, by application) | — | [Archpaper](https://www.archpaper.com/2026/04/autodesk-forma-building-design/) |
| Hypar 2.0 | Hypar | Rooms; walls (reuses the closest type by width, or makes a new "Hypar" type); HyparDoor and HyparWindow placeholders; columns. Each reload **overwrites** the previous load | Cloud space planning plus a Revit add-in (2020–2027) | SHIPPING | Personal free; Professional $100/user/month or $1,000/year | [docs](https://docs.hypar.io/guides-task-based-how-tos-for-everything-you-do-in-hypar./work-with-revit) |
| Snaptrude | Snaptrude | Two-way link that tracks Revit element IDs and sends back only the edited parts. Uses your own assemblies; curved geometry becomes DirectShape | Assemblies set first, then mass to BIM | SHIPPING | See 2.4 | [Revit interop](https://www.snaptrude.com/interoperability-with-revit) |
| TestFit | TestFit | Massing and elements mapped to your system families; parking; unit groups | Deterministic solver, also drivable through MCP | SHIPPING | Parking Solver $195/month (MCP add-on +$100/month); Site Solver from $15,000/year | [pricing](https://www.testfit.io/pricing) |
| Arcol | Arcol | Levels, generic walls and floors; context as DirectShape | Browser BIM | SHIPPING | Not stated | [help](https://intercom.help/arcol/en/articles/10448031-exporting-to-revit) |
| Motif | Motif (ex-Autodesk leaders) | **No Revit geometry write-back** in the 2026-09-08 release; comments do round-trip | Agent-native browser BIM | SHIPPING | $150 per active user/month; Enterprise from $200 | [AEC Magazine](https://aecmag.com/bim/inside-motif-the-agent-native-bim-platform/) |
| Finch | Finch | Walls, doors, area plans, sheets. Finch's own docs say to "Swap for studio standard walls" and "Replace with correct door families" | Plan library plus AI fit scores, via a Revit add-in | SHIPPING | Free and Basic tiers; Enterprise from €14,500/year (3 seats) | [Finch docs](https://docs.finch3d.com/courses/finch-101/finch-101-download-to-revit) |
| ArkDesign | ArkDesign.ai | RVT export (3 exports a month on Premium) | Cloud generation for US multifamily | SHIPPING | $180–1,800/month | [pricing](https://arkdesign.ai/pricing/) |
| ARCHITEChTURES; Spacio | — | Via IFC only | Generative residential | SHIPPING; BETA | Not stated | [Architechtures](https://architechtures.com/en), [Spacio](https://spacio.ai/why-spacio) |
| qbiq | qbiq | Editable Revit/CAD files delivered | AI space planning | SHIPPING | Not stated | [qbiq](https://www.qbiq.ai/capabilities/revit-cad-model-generation) |
| PlanFinder / SpaceFill | PlanFinder | Room layouts, walls, furniture inside Revit. SpaceFill learns room templates from the office's own projects | ML | SHIPPING | Not stated | [LinkedIn](https://www.linkedin.com/posts/planfinder_spacefill-for-revit-activity-7404184167078346752-c3OA) |
| Skema | Skema.AI | Claims a "construction-document-ready, native Revit model in minutes" by morphing the office's own Revit assemblies | Firm assemblies become stretchable 3D kits | UNKNOWN (marketing only) | Not stated | [skema.ai](https://www.skema.ai) |
| In Revit and scripting | Revit Building Maker (wall/floor/roof/curtain by face; manual "Update to Face"); Generative Design in Revit (Dynamo); Rhino.Inside.Revit (native or DirectShape per element; "Add Wall (Face)" from 2026-02) | Native typed | Manual picking or scripts | SHIPPING | Included / free | [Building Maker](https://forums.autodesk.com/t5/community-blog-aec-english/revit-making-buildings-with-the-building-maker-tools/ba-p/11654448), [Rhino.Inside](https://github.com/mcneel/rhino.inside-revit) |
| Bridges | SketchUp Importer for Revit (classified SketchUp to native walls, floors, slabs, curtain walls, windows); Speckle v3 (DirectShape by default, blocks to families, IDS/COBie validation beta); VisualARQ (via IFC); Qonic (Revit into Qonic, no write-back) | Native (SketchUp) or DirectShape (Speckle) | Mapping | BETA (SketchUp alpha); SHIPPING (others) | SketchUp Studio subscription | [SketchUp forum](https://forums.sketchup.com/t/sketchup-importer-for-revit/347695), [Speckle](https://speckle.systems/updates/native-revit-families-model-validation-beta/) |

### 2.6 LOD progression and detailing automation

| Tool | Vendor | What it does in Revit | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Monta AI | Monta AI (Omar Maher) | Turns early drawings or schematic Revit models, plus specs and firm standards, into editable LOD 300/350 using the firm's families. Demo: 1,200+ generic walls became DD wall types with material layers (240 exterior, 1,060 interior walls, 382 floors). Claims change propagation ("move a core, widen a corridor") | Reconstruction pass, then a spec-driven detailing pass. Shows its **assignment plan** before running, proposes fire ratings for review, **flags ambiguity** instead of guessing | BETA (sales-led; no download or price) | Not disclosed | [monta.ai](https://www.monta.ai/), [video](https://www.youtube.com/watch?v=dwVQ96mG7Gk), [LinkedIn](https://www.linkedin.com/posts/omaher_1200-generic-revit-walls-to-a-dd-ready-activity-7502764312529334272-hy7M) |
| SWAPP (Frank agent) | SWAPP.AI | SD to CD in Revit and Archicad: 2D-to-3D modelling, finishes, parameters, CD sets to firm standards | "Frank proposes, you approve." A two-week onboarding encodes firm standards | SHIPPING (enterprise only) | Not public | [swapp.ai/products/frank](https://swapp.ai/products/frank/) |
| AUTOM8LABS MCP Connector Pro | AUTOM8LABS (James Gray, UK) | Wall, floor, roof and ceiling types built from spec layer build-ups (13 wall types from 71 rows in under 3 min), with missing materials created. Ceilings from rooms. Walls attached to roofs. Finishes in 16 rooms plus skirting from two prompts | 363 MCP tools in 14 packs; dry-run previews | SHIPPING (Revit 2022–2027, docs v3.7.1) | Free: 38 read-only tools. Pro £10/seat/month or £100/year | [product](https://autom8labs.io/products/mcp-connector-revit/), [13 wall types post](https://www.linkedin.com/posts/james-gray-bim_autom8labs-ai-automation-activity-7508140669530546176-n-7p) |
| Concept-to-LOD-300 converter (unnamed) | Omar Abou Sharkh | Claims CAD or Revit concepts to LOD 300 using standards, approved families and local codes | Not disclosed | DEMO (an announcement only; no video) | — | [LinkedIn 2026-07-15](https://www.linkedin.com/posts/omarabusharkh_creating-lod-300-bim-models-from-conceptual-activity-7483195685186600960-Gi7q) |
| Kora Studio | Dextall | Facade design for unitized systems, LOD 100–300 | ML plus manufacturing rules | BETA (early access since 2026-04-21) | Pricing "being finalized" | [press release](https://www.globenewswire.com/news-release/2026/04/21/3278075/0/en/dextall-opens-kora-studio-early-access-automating-facade-design-in-revit.html) |
| Naviate Architecture | Symetri | Finish coverings, curtain grid designer, door tools and drawings | Rule tools | SHIPPING | €1,320/year | [store](https://store.naviate.com/products/naviate-architecture) |
| Auto Finishes | Biminent | Floor, wall and ceiling finishes for any number of rooms; full rollback | Rules by room | SHIPPING | $6.99/month | [Marketplace](https://marketplace.autodesk.com/apps/e8f30727-4131-477b-bbd0-f1425b6e161c) |
| ARKANCE (AGACAD) framing and curtain walls; StrucSoft MWF | ARKANCE; Graitec StrucSoft | Framing, prefab panels, curtain wall shop drawings, stairwell framing (LOD 350–400) | Rules on host elements | SHIPPING | Not listed | [ARKANCE](https://marketplace.autodesk.com/apps/4cc295ed-ea1e-42a8-b7b3-f8cf2d127dc1) |
| Informed Design; Trimble SysQue | Autodesk; Trimble | Manufacturer product families; generic MEP upgraded to LOD 400 content | Product templates / content database | SHIPPING | Talk to sales | [Revit 2026 news](https://www.autodesk.com/blogs/aec/2025/04/02/whats-new-in-revit-2026/), [SysQue](https://www.trimble.com/en/products/trimble-sysque) |
| Revit 2026/2027 native | Autodesk | Walls by room, walls hosted on walls, rule-based numbering, multi-category tags | Native commands | SHIPPING | Revit subscription | [BIM Pure on Revit 2027](https://www.bimpure.com/blog/revit-2027) |
| GPT-6 Astra detail from a sketch | BIM Pure | 2D detail views with detail components, tags and dimensions. About $10 and 20 min per detail; "too long for firmwide use"; experts called it "very sloppy" | Agent plus MCP, fed a Notion office procedure | DEMO | — | [BIM Pure](https://www.bimpure.com/blog/hand-drawn-sketch-to-revit-detail-with-gpt-6-astra) |
| Documentation automation | Glyph ($50–97/month), DiRoots (freemium, including IDS4Revit), Ideate, CTC, ArchiLabs, Pirros Mira (free plan), BIMLOGIQ | Views, sheets, dimensions, tags, schedules | Rules and agents | SHIPPING | As stated | [Glyph](https://www.evolvelab.io/glyph), [DiRoots](https://diroots.com/), [Mira](https://www.pirros.com/mira) |

### 2.7 Structure and MEP auto-layout

| Tool | Vendor | What it builds | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Endra Power Studio | Endra | Native Revit electrical models, single-line diagrams, panel schedules. Endra bought Planlabs to add mechanical design | Firm standards encoded as "Playbooks" | SHIPPING (launched 2026-09-17) | Not disclosed | [AEC Magazine](https://aecmag.com/mep/endra-launches-electrical-design-platform-and-buys-planlabs/) |
| Augmenta ACP 2.0 | Augmenta | Clash-free electrical raceway (about LOD 350) | Automated router | SHIPPING | Not disclosed | [press](https://www.globenewswire.com/news-release/2026/06/17/3313424/0/en/Augmenta-Releases-ACP-2-0-the-Complete-AI-Native-Design-Environment-Built-to-Multiply-Electrical-VDC-Team-Output-and-Capacity.html) |
| MEPAIA | MEPAIA | Duct, pipe and tray routing with pressure-loss calculations, in Revit | Voice/text agent | BETA | Not disclosed | [mepaia.ai](https://mepaia.ai/) |
| EVOLVE MEP; Naviate Structure; Revit 2027 analytical auto-sync | EVOLVE; Symetri; Autodesk | Hangers, sleeves, spooling; rebar and piles; analytical model kept in sync | Rules | SHIPPING | Not listed | [EVOLVE](https://evolvemep.com/), [Naviate Structure](https://www.naviate.com/naviate-for-revit/naviate-structure/features/) |
| AI-structure Copilot | Xinzheng Lu group (Tsinghua) | Shear-wall layout from an architectural plan, inside Revit | AI plus optimisation | SHIPPING (Chinese residential) | Not stated | [LinkedIn](https://www.linkedin.com/posts/xinzheng-lu-7572621a_ai-structure-copilot-now-fully-compatible-activity-7404680299734872065-ZqL6) |
| MEP from CAD | BIM KIT; BIM Soft Solutions; ABM_Engineer | Pipes, ducts, trays from CAD layers | Layer mapping | SHIPPING | BIM KIT $25; ABM free | [Marketplace search](https://marketplace.autodesk.com/search?q=cad%20to%20bim) |
| ConstructAI framing demo | Fernando Maytorena | From a PDF: 371 columns and 652 framing members at 16" centres, with headers | Confidence-scored extraction, then an agent models it | DEMO | — | [LinkedIn](https://www.linkedin.com/posts/fernandomaytorena_construction-bim-contech-activity-7432817726324244480-qQN3) |
| Skyewriter | Skyhook Modular (in-house) | Re-stacks a 588-module LOD 400 building when the pro forma changes | Module digital twins | DEMO (not sold) | — | [LinkedIn](https://www.linkedin.com/feed/update/urn:li:activity:7487857682717179904) |
| Stru | stru.ai | ETABS/SAP2000 results synced into Revit | AI interpretation | UNKNOWN | — | [blog](https://stru.ai/blog/best-ai-plugin-revit) |

No tool was found that generates a structural scheme from an architectural model outside China.

### 2.8 AI agents, MCP servers and copilots

| Tool | Vendor | What it can create in Revit | Safety model | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Revit Public MCP Server | Autodesk | Read tools, plus Write and Experimental tiers: parameters and types, move and rotate, delete (with confirmation), views, sheets, schedules, tags, IFC/gbXML export. **No tool creates walls, floors, roofs, rooms, levels or family instances** | Separate installable read and write servers | BETA (tech preview, Revit 2027 only) | Included with the Revit 2027 entitlement | [tools page](https://help.autodesk.com/view/ADSKMCP/ENU/?guid=revitmcp_tools), [blog](https://www.autodesk.com/blogs/aec/2026/06/17/revit-public-mcp-server/) |
| Autodesk Assistant in Revit | Autodesk | Views, schedules, sheets, rooms, tags, parameter edits. AEC Magazine says it cannot touch existing geometry | Not documented | BETA | Included | [AEC Magazine](https://aecmag.com/bim/giving-ai-actual-write-access-in-revit) |
| Next-generation Assistant; Autocomplete Room Elements (AU 2026) | Autodesk | Room element autocompletion, annotations, documentation | "Review and accept" | DEMO | Timing and pricing in 2027 | [Autodesk news](https://adsknews.autodesk.com/en/news/autodesk-design-make-vision-au-2026/) |
| Dynamo MCP (Dynamo 4.2) | Autodesk | Builds Dynamo graphs; cannot change Revit directly | Grounded in shipped sample graphs | SHIPPING | Included | [Dynamo](https://dynamobim.org/dynamo-core-4-2-release/) |
| Claude to Revit | Geopogo | Write tools: create_wall, create_floor, create_roof, create_door, create_window, set_element_parameter, set_active_view, delete_element, run_revit_command. Needs Node 18+ and Claude Desktop or Cursor (ChatGPT via MCP developer mode) | Local HTTP port 8765, Idling event, undoable transactions. The "Model Understanding Check" and approval steps are only advice in a prompting guide, not enforced in code. The Marketplace page lists these limits (one check did not find them): roof types must exist, door/window families must be loaded, one Revit session per port | SHIPPING. Revit 2025–2027, not LT. Marketplace v2.0.0 (2026-07-14, updated 2026-09-01), 0 reviews | $250 one-time Pro, $69 Personal, $32 Education; 5 seats $1,125 up to 100 seats $17,500; or $19.99/month on the Marketplace | [product](https://geopogo.com/rnd/claude-to-revit), [Marketplace](https://marketplace.autodesk.com/apps/77c7b44e-89fc-4ae6-9f6a-7bbfbdba7fcb) |
| Horizun Revit MCP | Horizun Group | 123 tools, including typed batches of levels, grids, walls, slabs, roofs, rooms, family instances, structure, MEP runs, openings, stairs, curtain grids, and splitting multilayer walls | Rehearse, then token, then apply, then re-read, with spatial checks. It also ships **ISO 19650 information management**: project context (EIR/BEP/MIDP, naming, IDS from LOIN), containers moved through WIP/Shared/Published/Archived, IFC delivery proved against IDS with BCF, delivery approvals, a coordination ledger, and a propose/review/approve registry that promotes scripts to procedures | SHIPPING. Free, Apache-2.0, v2.1.4 (2026-09-28), 42 stars | Free | [GitHub](https://github.com/HorizunGroup/horizun-revit-mcp) |
| BIMwright rvt-mcp | bimwright | 227 typed tools, plus a C# send-code escape hatch that is on by default. Family Editor is out of scope | `--read-only` switch; ToolBaker turns repeated patterns into tools | SHIPPING. Free, Apache-2.0, Revit 2022–2027 | Free | [GitHub](https://github.com/bimwright/rvt-mcp) |
| mcp-servers-for-revit | community | Point, line and surface elements, levels, grids, rooms, framing, send_code | AI code is committed in one automatic transaction ("执行AI代码"), with no preview | SHIPPING. Free, MIT. revit-mcp archived (last push 2026-02-25); monorepo last push 2026-04-05 | Free | [GitHub](https://github.com/mcp-servers-for-revit/mcp-servers-for-revit) |
| Archi Automate | goto.archi | Any operation composed on demand, across 12 hosts | Read-only by default, dry-run where the host supports it, host transactions with undo, every step logged. IDS validation with one BCF issue per failure. Quotes before it spends and keeps a cost record | SHIPPING (Revit 2024–2027) | €15/month, €99/year, €267 for 3 years | [goto.archi](https://goto.archi/ai-for-revit) |
| AUTOM8LABS | AUTOM8LABS | See 2.6 | Dry-run previews | SHIPPING | £10/seat/month | [product](https://autom8labs.io/products/mcp-connector-revit/) |
| BIMLOGIQ Argus | BIMLOGIQ | Multi-agent; reads drawings, PDFs and images; families; saved commands | Shows the plan and a code preview | BETA (early access, 2026-07-15) | Not verified | [LinkedIn](https://www.linkedin.com/posts/bimlogiq_were-excited-to-announce-argus-the-next-activity-7483035185077252096-sYB2) |
| HMK Pilot AI | HMK Tools | "Over a hundred actions" (site) or 340+ (post), across Revit, AutoCAD, Civil 3D and Navisworks | Sandboxed scripts approved in chat; destructive actions need an explicit scope; remembers errors | SHIPPING | 14-day trial | [hmktools.com](https://hmktools.com/revit-mcp) |
| Pirros Mira | Pirros | Sheets, parameters, schedules. No geometry | Full plan shown first, then approve; one Ctrl-Z for the batch | SHIPPING | Free plan | [pirros.com/mira](https://www.pirros.com/mira) |
| Other agents | Zexus (Roslyn C#, plan then confirm; free); AEC Model Bridge (approval gate with before-state; GPL); NonicaTab (read-only, no code generation; free/PRO); DWD AI Assistant ($9.95/month); oakplank RevitMCP (dry-run deletes); LuDattilo/RevitCortex (autonomous, no grouped undo); JustAsk (plan then execute; free); AnalyseTool (concept KPIs; free) | Various | As listed | SHIPPING | As listed | [Zexus](https://github.com/QuanZ827/zexus), [AEC Model Bridge](https://github.com/Sam-AEC/aec-model-bridge), [NonicaTab](https://marketplace.autodesk.com/apps/29edb5ce-fedc-4581-bc24-f03040d21056) |
| Demos | Loom (code as a proposal inside a transaction); Atenea (JSON only, never code); Hoverboard (feedback loop, image markup); Cora; MSV Revit AI (agent-written tools installed only after approval); ArchiTECH (local 27B model, verifies each action); CA MCP; Fahdah connector | — | — | DEMO | — | [Loom](https://www.linkedin.com/posts/shengwei-li_revit-bim-ai-activity-7492955090711134208-iu9r), [Atenea](https://www.linkedin.com/posts/irvingresendiz_bim-revit-artificialintelligence-activity-7388665823864991744-4hjl), [Hoverboard](https://www.linkedin.com/posts/mengyuzhao1211_architecture-ai-revit-activity-7474444004496138241-wjN6/) |
| Outside Revit | McNeel RhinoAI (the official create/edit MCP for Rhino); Raven; Cordyceps; Speckle Intelligence and model checker; Tektome (review assurance) | — | — | BETA / SHIPPING | — | [RhinoAI](https://github.com/mcneel/RhinoAI) |

**Security warning (verified).** The GitHub repo TunnelConductorTrip/revit-prime (198 stars) tells users to download and run a "setup file" from an outside site. It matches the fake-software lure pattern. Do not install unvetted Revit add-ins.

### 2.9 Family generation

| Tool | Vendor | What it builds | Method | Maturity | Price | Source |
|---|---|---|---|---|---|---|
| Ideatura component modelling | Ideatura | A parametric family from a 2D component sheet; the vendor says "still far from perfect" | LLM plus geometry engine | BETA (paid pilots with London firms since Sept 2025) | Not disclosed | [ideatura.ai](https://ideatura.ai/), [Digest](https://aiaecdigest.substack.com/p/ideatura-ai-architecture-documentation-automation) |
| AUTOM8LABS data-sheet-to-family | James Gray | From a manufacturer data sheet: a ceiling-hosted light family with the light source placed, photometrics carried over, and 3 finishes as types | Web app on top of the MCP connector | DEMO (prototype, 2026-08-13) | — | [LinkedIn](https://www.linkedin.com/posts/james-gray-bim_autom8labs-ai-automation-ugcPost-7493442771698139136-176B) |
| FamFab | ArchSmarter | A loadable family from a photo or sketch. Parameters and reference planes are created but not wired, so the family is static | Claude writes a JSON family definition, you review a 3D preview, then a deterministic executor builds it | SHIPPING (free, MIT, Revit 2025–2027) | API about 20 cents per refine pass | [blog](https://www.archsmarter.com/blog/open-source-revit-family-generator) |
| Mainspring | Automata Digital Studio | .rfa files from text, sheets, photos or sketches, in the browser. "LOD 300 in about five minutes" is a stated design target, not a benchmark | Brief, generate, download | BETA (private beta closed; waitlist) | — | [site](https://automatadigital.studio/mainspring/) |
| BIMLOGIQ Argus families | BIMLOGIQ | A parametric cabinet that flexes | Agent | BETA | — | [video](https://www.youtube.com/watch?v=puw9sUkJZJU) |
| Demos | Kay Izadian (MEP heat exchanger with connectors, via a Claude skill); Suraj k p (Claude re-verifies 20 types after each change); Pixy (Image to Blocks); Ilia Ivanov (browser .rfa downgrade from 2026 to 2025) | — | — | DEMO | — | [Izadian](https://www.linkedin.com/posts/kay-izadian-21698146_bim-vdc-ai-activity-7507158608804143105-1GMY), [Ivanov](https://www.linkedin.com/posts/ilia-ivanov-298997161_bim-revit-webcad-ugcPost-7490055292857008128-Av5j) |

### 2.10 What the map says

1. **Connecting an LLM to Revit is now commodity.** Free MCP servers exist: Horizun with 123 tools, BIMwright with 227 tools, and mcp-servers-for-revit. Autodesk has left geometry creation to third parties.
2. **DWG/PDF to LOD 200 is crowded and cheap.** WiseBIM costs $49/month, AmpliFY is free, Nexar Plan is £50/month, and BIMify (AK Tools) is free.
3. **The September 2026 wave is agentic photo-to-native**: Veras 5.2, Geopogo, HMK and Finch with Astra. The output is mostly massing or schematic level.
4. **Concept platforms all stop at generic LOD 200.** Forma, Hypar, Finch, Arcol and TestFit all hand over generic types. Finch's docs even tell users to swap types by hand.
5. **Very few products attack LOD 200 → 300 directly.** Monta (BETA) and SWAPP (enterprise) do. AUTOM8LABS covers pieces of it. No product treats LOD as governed data per element.
6. **Horizun is the closest competitor to Sentinel's governance idea, and it is free.** It has verified writes, ISO 19650 containers, IDS from LOIN and a script-promotion registry. It runs on a single machine inside one agent session: no multi-user identity, no hash-chained web ledger.

---

## 3. What people post on LinkedIn

### 3.1 The founder's shared posts, batch A (modelling)

| Post | Date | What it actually shows | What the comments say |
|---|---|---|---|
| [Michael Hoppe, residential plans from a long brief](https://www.linkedin.com/posts/michaalhoppe3dfx_revit-autodesk-architecture-ugcPost-7480079062212730880-1SiD) (Fable 5 + Geopogo) | 2026-07-07 | Complete residential floor plans from a text brief; the prompt is posted in a comment. 911 likes, 70 comments | Requests for Bluebeam sketch input, parametric families, MEP. Complaints about token burn. One self-promotion (Nodu Bridge) |
| [Hoppe, floor plan rebuilt from a drawing](https://www.linkedin.com/posts/michaalhoppe3dfx_revit-claudeai-artificialintelligence-ugcPost-7480300072006508544-acbW) | 2026-07-07 | A plan read and rebuilt in minutes | Neil Morten: accuracy is not good enough. Luqman Komban: an 85%-right first pass is still a win |
| [Hoppe, historic office from one photo](https://www.linkedin.com/posts/michaalhoppe3dfx_revit-bim-architecture-ugcPost-7481109463077376000-L-6n) | 2026-07-09 | Existing building from a single photo. 708 likes, 90 comments | Randy Stogsdill wants PDF-set input. Pablo Gancharov: host-aware geometry is the hard part |
| [Hoppe, Part 2](https://www.linkedin.com/posts/michaalhoppe3dfx_revit-bim-aec-ugcPost-7482868698563751936-AFdK) | 2026-07-14 | "A much larger set of Revit tools"; existing conditions from one photo; "This isn't image generation" | Christian Wauben: constrain with a known dimension. Gary Cowan: a "cardboard model". Ron Suverkrop: fixing may take longer than modelling |
| [Hoppe, organic tower, massing first](https://www.linkedin.com/posts/michaalhoppe3dfx_ai-revit-bim-ugcPost-7485003527866540032-eGYk) | 2026-07-20 | Massing, then geometry, then Unreal with Cesium context | Simon Nelson: "still a gimmick". Mustafa Salaheldin: "deliver the core and shell". Greg Demchak suggests the iTwin plugin |
| [Hoppe, Salesforce Tower](https://www.linkedin.com/posts/michaalhoppe3dfx_ai-architecture-revit-ugcPost-7487621623206920193-DQBV) | 2026-07-27 | Conceptual model from images; the author says "not a finished construction model" | Token and time cost asked, no answer visible |
| [Kristijan Vilibić, Geopogo reshare](https://www.linkedin.com/posts/kristijan-vilibic_ai-fable5-claudeai-ugcPost-7485647921867157504-72zL) | 2026-08-25 | "Comment and I'll send you the link" | Token cost; building codes |
| [Andrea Rocco Matta (Ideatura), office standards](https://www.linkedin.com/posts/andrearoccomatta_architecture-revit-bim-ugcPost-7488525395487698944-07Tr) | 2026-07-30 | Chained automations produce plans, GAs, elevations and stairs to his drawing standards | Karim Maghraby: "Reuse needs governance, not just prompts" |
| [Matta, 2D drawing to parametric family](https://www.linkedin.com/posts/andrearoccomatta_architecture-revit-bim-ugcPost-7489941637490556930-NvFn) | 2026-08-03 | "Still far from perfect". 315 likes | Wauben: a wrong driving parameter is worse than no family. A tester: you must steer it against hallucinations. Xavier Pérez-Estrada: parameter naming is the real cost |
| [Faizan Farooqui, free local text/image to Revit](https://www.linkedin.com/posts/faizan-farooqui-4b6985160_from-imagetext-to-revit-model100-free-ugcPost-7490699924922085376-dDUt) | 2026-08-05 | Local open models (Gemma 4) | Only simple shapes work |
| [Vilibić, Tejas Mhaske CAD to Revit](https://www.linkedin.com/posts/kristijan-vilibic_bim-revit-cadtobim-ugcPost-7485637627052797952-ZKSs) | 2026-08-03 | Floors, walls, doors, windows, ceilings from CAD; no method shown | "Dynamo did this years ago" |
| [Nikolai Davydov, AnalyseTool](https://www.linkedin.com/posts/nikolai-davydov-4359bba1_revit-bim-aec-ugcPost-7485601123890868224-kTAi) | 2026-07-22 | Massing to a German early-phase KPI calculator in 30 min | The author admits he did not verify the AI's formulas |
| [Ilia Ivanov, .rfa downgrade in a browser](https://www.linkedin.com/posts/ilia-ivanov-298997161_bim-revit-webcad-ugcPost-7490055292857008128-Av5j) | 2026-08-03 | Rebuilds a 2026 family as a working 2025 .rfa | Nested families, formulas |
| Not about modelling | 2026-07 to 09 | TraceLayer (a tracing overlay); [dotBEP](https://github.com/HoyosJuan/dotbep), an open BEP format with LOD/LOI/LOIN per phase that could serve as a target format; FragmentsUnity; [Wayki](https://wayki.app/), a CDE competitor to Sentinel; MODELi; an AU talk | — |
| Instagram | 2026-07 to 09 | Geopogo cost-report reel (805 likes); arch_ai_lab AXO views (a lead magnet); two unrelated reels | Comments are behind the login |

### 3.2 The founder's shared posts, batch B (AI and BIM, mixed)

| Post | Date | What it actually shows | What the comments say |
|---|---|---|---|
| [Amar Hanspal, Motif launch](https://www.linkedin.com/posts/amarhanspal_today-we-reveal-motif-design-to-the-world-ugcPost-7503103478412615680-3gGs) | 2026-09-08 | Agent-native browser BIM. No Revit geometry write-back yet | Seat price, free trial |
| [Nicolas Catellier, GPT-6 Astra detail from a screenshot or sketch](https://www.linkedin.com/posts/nicolascatellier_astra-gpt-6-revit-for-detailing-prompt-share-7504161436982620160-JXow) | 2026-09-11 | A Revit detail with components, tags and dimensions; it also created the missing detail-item families. 2,524 likes, 150 comments | Dr Shawn O'Keeffe: "very sloppy" (leaders, dimensions, missing sill sealer, hatching). Liability without qualified review. Compute cost at project scale. IP and offline models. "Silos of slop" |
| [Chaitanya Bharech, test of the viral "AI modelled hotel MEP" claim](https://www.linkedin.com/posts/cbharech_bim-constructiontech-ai-ugcPost-7502051280090050560-C-2y) | 2026-09-07 | Claude with the Blender MCP made a mesh from a plan and one elevation; stair and door defects | Author: "not replacing BIM today". Mudit Jain describes a layer-driven DWG add-in |
| [James Gray, data sheet to family](https://www.linkedin.com/posts/james-gray-bim_autom8labs-ai-automation-ugcPost-7493442771698139136-176B) | 2026-08-13 | Hosted light family with 3 finish types from a manufacturer data sheet | First comment: manufacturer copyright |
| [Philippe Bédard, Prevu3D mesh to IFC](https://www.linkedin.com/posts/philippe-b%C3%A9dard-b23124148_theres-a-lot-of-excitement-right-now-around-ugcPost-7503555084669296640-kWcl) | 2026-09-09 | "Imperfect but it worked" | QA of the generated IFC, sovereignty, sign-off |
| [Allister Lewis (ADDD), five tools added](https://www.linkedin.com/posts/allisterlewis_your-bim-team-spends-hours-each-week-on-work-ugcPost-7488899800160002048-G69N) | 2026-07-31 | Nexar Docs, Wayki, DesignBuildAI ("LOD 300 with AI"), Conduit AEC, functionize BIM | Vendor thank-yous |
| [That Open, WebMCP IFC editor](https://www.linkedin.com/posts/befreeagain-ugcPost-7503588349916581888-0yy4) | 2026-09-10 | An agent calls a web app's own functions to fix a door fire rating. **Directly reusable in Sentinel's That Open app** | — |
| [Hamza Arshad, BIM Naming Manager](https://www.linkedin.com/posts/hamza-arshad-acp-045024295_iso19650-bim-revit-ugcPost-7502666480241754112-YIFi) | 2026-09-07 | ISO 19650 family-name checks | Overlaps with Sentinel's naming suggestions |
| Not about modelling | 2026-08 to 09 | That Open 5D app, a clash app built from prompts, Pic on Site; Superplan; three.js "3D slop"; a voice agent; IFC to priced BOQ; Forma Schedule 4D (two posts); a free Claude Code proxy; Nano Banana rendering | — |
| Viral Solvaix claim (X) | 2026-07-28 | "Kimi K3 modelled a 190-room hotel's MEP for $10,500." Names no firm, project or software. The hands-on replication produced a mesh with defects | Treat it as marketing |

### 3.3 Who else is building (from the LinkedIn sweeps)

| Group | Builders and posts | What they show |
|---|---|---|
| DWG/PDF | [WiseBIM new version](https://www.linkedin.com/posts/wisebim_the-all-new-wisebim-ai-for-autodesk-revit-activity-7437120410007097344-vNA_) (2026-03-10); ORIGIN test (2026-07-22, read on WiseBIM's page); [PdftoRvt](https://www.linkedin.com/posts/pdftorvt_bim-revit-aec-activity-7447317848315703296-YBJG); ConstructAI; [Jeffrey Pinheiro's WiseBIM head-to-head](https://www.linkedin.com/posts/jeffreypinheiro_bim-revit-architecture-activity-7381140138090999808-CoWj) | ORIGIN measured about 60–65% on clean underlays and called it "not a hands-off solution yet". Pinheiro: PDF and CAD beat sketches; thick lines and heaters fool width detection |
| Agentic image to native (September wave) | [Ben Guler, Veras](https://www.linkedin.com/posts/benjamin-guler-16378233_agentic-modeling-is-here-this-is-the-beginning-activity-7510744806046920704-QzMX); [Phil Read](https://www.linkedin.com/posts/readphil_veras-52-agentic-modeling-with-astra-activity-7509212476731826176-rKOQ); Finch + Astra recreating 520 Fifth by KPF; [Geopogo Tesla Semi](https://www.linkedin.com/posts/michaalhoppe3dfx_revit-bim-ai-activity-7509711731292622848-fLOe), DeLorean, Golden Gate via Dynamo; [HMK photo to 4D](https://www.linkedin.com/posts/hmktools_revit-autocad-civil3d-activity-7505150966435057664-tLPX); Studio Tim Fu | A field report on Veras: a scanned plan plus 6 photos "did alright", "probably saved me about 2 hours", "needs some TLC", used a lot of credits. Much of the Geopogo marketing is novelty objects |
| LOD / DD | Monta ([2026-07-15](https://www.linkedin.com/posts/omaher_our-ai-solution-transfers-early-conceptual-activity-7483136625615679488-xf_h), 2026-09-07); Omar Abou Sharkh; AUTOM8LABS finishes and types; SWAPP; Skema | Monta: "flagging ambiguous conditions instead of guessing is the real trust signal" (commenter). Others: "how is this different from Claude plus the Revit API?" |
| MCP builders | [Autodesk MCP launch (Brumm)](https://www.linkedin.com/posts/harlan-brumm_revit-bim-aec-activity-7447997172597428224-R1Xs); [Pedro Nadal](https://www.linkedin.com/posts/pedro-nadal_revit-revit2027-revitmcp-activity-7448042179966521346-IzF6); [Mohannad Eltayeb (master's research)](https://www.linkedin.com/posts/mohannad-hany-eltayeb-66970925b_revit-claudeai-modelcontextprotocol-activity-7508205542486585345-Lp84); [Ghasem Ariyani](https://www.linkedin.com/posts/ghasemariyani_revit-bim-gpt6astra-activity-7506725198369587200-uSm_); [Darpan Nagrecha](https://www.linkedin.com/posts/darpan-nagrecha_claude-ai-killed-my-repetitive-revit-tasks-activity-7470811815166382081-PjRl); [MAHADEVA G](https://www.linkedin.com/posts/mahadeva-g-5880a2205_revit-bim-claudeai-activity-7499995311960969216-jxNA); [Bryan Morales](https://www.linkedin.com/posts/bryanmorales96_bim-revit-ai-activity-7481840281827508224-8Vok) | Eltayeb thread: "Building the model was the fast part... How do you validate". Ariyani: Astra + MCP output "cannot be considered reliable on their own". Nagrecha: a vague prompt put the slab on Level 1. Morales: stairs are unreachable |
| Scan | [ClearEdge3D](https://www.linkedin.com/posts/clearedge3d_edgewise-omnislam-scantobim-activity-7487718698539986944-V2c9); CRXAI; Q.bit | A 20-minute scan of an industrial facility became a Revit-ready as-built in 14 hours. A commenter: "our challenge is point cloud to revit!" |

### 3.4 Questions that keep coming back in the comments

1. **"Is it right? How do I validate it?"** This is the most repeated need (Eltayeb thread, Ariyani, the Catellier teardown).
2. **"What does it cost?"** Tokens, credits, quota, minutes. Catellier reports about $10 per detail. Archi Vlogs used about 340 credits for one house. Most Geopogo posts leave it unanswered.
3. **"Is it native or mesh?"** BIM Pure's DirectShape cabin; "Native geometry or mesh?" asked on Mainspring.
4. **"It is only a shell."** No cores, structure, interiors or MEP (Salaheldin, Cowan, Nelson).
5. **"The photo has no scale."** Give a known dimension (Wauben).
6. **"Office standards are the real test."** Families, naming, driving parameters (Paul Vosloo, Pérez-Estrada, Wauben).
7. **"Give me safe writes."** Permissioning, identity, dry-run, rollback, audit (Nadal thread).
8. **"Read my PDF set or my Bluebeam markups."** For existing buildings, a week of manual modelling (Stogsdill).
9. **"LOD drifts from 200 to 300 without anyone noticing."** Models are rejected for the wrong LOD (Darpan Nagrecha). "The 200 to 300 jump is where most issues start" (Prem Talreja).
10. **Liability, IP, data sovereignty, offline models.**
11. **"Dynamo did this years ago."** Rule-based CAD-to-BIM is not new. Messy real drawings are the hard part.

---

## 4. How the best tools work

### 4.1 Techniques

| Technique | Who uses it | Strength | Weakness | Sentinel today |
|---|---|---|---|---|
| CAD layer → Revit category mapping | Helix, BIMify, Nexar Plan, Hongwa, Horizun, Ghost Builder | Fast and repeatable | Breaks on exploded, gappy or spline lines, unbound xrefs and bad layer names | Yes. Tiered: standard, then cache, then heuristics, then local LLM |
| Wall-face pairing; thickness bands → types; cap on new types | EaseBit, Helix 2.12, WiseBIM, Ghost (WallPairing + GuidelineMatcher) | Gives a real type, not a line | Depends on clean parallel lines | Yes |
| CAD block → family, with hosting and attributes | Bird Tools, ADHOX, BIMLOGIQ | Openings and fittings in the right place | Needs intact, named blocks | Partly. Instances are placed **unhosted** |
| Raster/PDF deep-learning detection | WiseBIM, AmpliFY, BIMxAI, Geopogo FloorPlan | Works on scans and PDFs, no layers needed | Needs resolution; title blocks read as walls; windows are the weakest class | No |
| Vector PDF reading with a confidence score per element | Bid BIM | Reads the drawing sets clients actually send | — | No (PDF is read as text) |
| The LLM writes a spec, a deterministic builder executes it | CAD2BIM ("the model understands, the exporter builds"), ArchSmarter, Sketch2BIM, FamFab, Atenea, Veras bake | Checkable and repeatable | Only as good as the schema | Partly (MCP changeset JSON) |
| An agent drives typed MCP tools | Geopogo, Horizun, BIMwright, AUTOM8LABS | Flexible | Quality depends on the model. Output is native only if types and families are already loaded | Partly (4 element kinds) |
| An agent writes code (send_code, Roslyn, pyRevit) | mcp-servers-for-revit, Zexus, BIMwright | Can do anything | Hard to govern; errors go unflagged | No, which is good |
| Self-check against the sources | Veras (12 views and "?" markers), photo-to-bim (reprojection error), Suraj k p (re-verifies all types) | Honest about guesses | Costs tokens | No |
| Generative solvers and plan libraries | Finch, TestFit, PlanFinder, Autodesk neural CAD | Good options fast | Generic output types | No |
| Rule- or spec-driven type upgrade | Monta, AUTOM8LABS build-ups, Hypar and TestFit mapping, Snaptrude pre-assigned assemblies | The real LOD 200 → 300 step | Needs clean spec data | At placement only (GuidelineMatcher) |
| Scan fit-to-spec with coverage QA | EdgeWise, CloudWorx | Native families; you see what was left out | Semi-automatic | No |
| Plan, then approve, then one Undo | Mira, Loom, Zexus, Monta's assignment plan, Autodesk (deletes) | Trust | — | Yes: tick list plus one transaction |
| Verified writes: rehearse, token, apply, re-read | Horizun; KIR (research) | Catches silent failures | More engineering | No |
| Promote a verified run into a named tool | Horizun promote_script, BIMwright ToolBaker, Argus saved commands, Motif skills | Turns a one-off success into a repeatable one | Needs governance | No |
| Checkers inside the loop | Text2BIM, HarnessBIM, Self-Verification, Archi (IDS + BCF) | Research consensus: generators need verifiers | — | IDS gate at the propose step |

### 4.2 What accuracy is realistic

| Evidence | Number | Source |
|---|---|---|
| WiseBIM on clean underlays (independent hands-on) | About 60–65%. "Not a hands-off solution yet." The vendor says v1.4.1 fixes most points | ORIGIN, 2026-07-22 (read on [WiseBIM's page](https://www.linkedin.com/company/wisebim/)) |
| WiseBIM on a 20-year-old scanned plan | More than 80% of walls right; windows need work; doors almost perfect | [Marketplace review](https://marketplace.autodesk.com/apps?id=7792821748025964445), 2026-04-08 |
| Sketch to Revit | About 85% in 35 min. "Probably no faster than modelling by hand" | [ArchSmarter](https://www.archsmarter.com/blog/ai-sketch-to-revit-model) |
| Sketch2BIM walls | About 83% on the first pass; near-perfect only after human feedback (10 plans) | [arXiv](https://arxiv.org/abs/2510.20838) |
| LLMs editing IFC (324 tasks) | Best model averages 49.5%; no model fully solves more than 3.4% of tasks | [BIM-Edit](https://arxiv.org/abs/2606.20146) |
| GUI agent authoring BIM | 32% of operations succeed | [BIMgent](https://arxiv.org/abs/2506.07217) |
| Scan to BIM | "Up to 73%" automated (vendor) | [ClearEdge3D](https://www.clearedge3d.com/edgewise/) |
| aurivus scan to walls | LOD 100 walls; interior joins fail | [review](https://www.youtube.com/watch?v=7OhgOokstbI) |
| Photo reconstruction | 3 cm off on one 184 cm measure (a single dimension only). photo-to-bim: all 4 examples exceed its own 5 px tolerance | [Tim Fu](https://www.linkedin.com/posts/studio-tim-fu_breakthrough-with-astra-we-tested-photo-model-reconstruction-activity-7502327842152640513-ytJC), [photo-to-bim](https://github.com/alekseikondratenko/photo-to-bim) |
| Vendor claims with no independent data | AmpliFY 90%; BIMxAI 90%+; Bimify's CEO "100%"; XGRIDS 70–90% | Vendor pages |

**What to expect:** 60–85% on real drawings. Humans fix the rest. The honest metric is **edit cost** (how much a person must change afterwards), not a headline accuracy percentage (as proposed by fpvec-lab). No vendor publishes edit cost.

### 4.3 Where every tool still needs a human

- **Scale and the missing dimension.** Photos underdetermine geometry. PDFs need a scale.
- **Noise on the sheet.** Title blocks, legends, heaters and thick lines.
- **Windows.** The weakest class in every tool.
- **Hosting, joins, and walls attached to roofs.** "Host-aware geometry is the hard part."
- **Stairs.** Their parameters depend on each other; the AEC Magazine test got stair dimensioning wrong.
- **Choosing the office type and family.** Geopogo needs them pre-loaded; Finch's docs say swap them by hand.
- **Driving parameters in families.**
- **Code and fire-rating decisions.** Monta flags these for review rather than deciding.
- **Final sign-off and liability.**

---

## 5. The concept → DD → CD chain

The steps an office repeats on every project, with the best tool on the market, what Sentinel does today, and the gap.

| # | Step | Best market tool today | Sentinel today | Gap |
|---|---|---|---|---|
| 1 | Brief / program → massing | Snaptrude, Forma Building Design, TestFit, Hypar, Finch (all SHIPPING) | Photo Massing: one rectangular box | No brief or program input. No import of masses or Forma, Snaptrude or Hypar output |
| 2 | Levels and grids | Forma BD export; Horizun; MCP create_level/create_grid | Datum from DWG (LEVEL/GRID layers); changeset levels and grids | No datum from massing or PDF; no arc grids; layer words are fixed |
| 3 | Shell: typed walls, floors, roofs | Building Maker by face (manual); Forma BD (generic); Snaptrude (your assemblies); SketchUp Importer (BETA). From DWG: WiseBIM, AmpliFY, Nexar Plan | Ghost: walls, floors and ceilings typed by the guideline; one level; 10 ft walls; no roofs | Roofs; level-to-level heights; mass faces → typed elements |
| 4 | Cores, stairs, shafts, lifts | **No shipping generator.** Monta claims stair checks; Horizun and Nexar Plan can create stairs | None | Wide open |
| 5 | Doors and windows, hosted | WiseBIM; Geopogo (with pre-loaded families); Horizun; Hypar placeholders | Unhosted point instances | GHB-1: host in the wall, size from the drawing |
| 6 | Rooms and areas | WiseBIM, AmpliFY, Geopogo FloorPlan, Hypar (spaces → rooms), MCP create_room | None | Rooms from closed wall loops, named from drawing text |
| 7 | Curtain walls and facade | Kora (BETA); Naviate curtain grid; Nexar Plan (from DWG); Rhino.Inside; Horizun curtain grids | None | A facade rule → curtain wall type + grid |
| 8 | Structural grid, columns, slabs, framing | No arch → structure scheme generator outside China. ConstructAI framing (DEMO) | Columns only as unhosted symbols | A structure seed from the grid plus rules |
| 9 | **Generic → office types (the LOD 300 swap)** | Monta (BETA); SWAPP (enterprise); AUTOM8LABS builds types from build-ups; Finch says "swap manually" | Type choice at placement only; type creation from the catalogue | **The core gap: retype an existing model against the spec and the LOD matrix, with a plan and a receipt** |
| 10 | Finishes | Auto Finishes ($6.99/month), Naviate, AUTOM8LABS, BIMLOGIQ | None | Commodity. Do it later, or as a recipe |
| 11 | Data: fire and acoustic ratings, classification, LOI | Monta proposes fire ratings; DiRoots IDS4Revit; Horizun IDS from LOIN | **Fix in Revit** (IDS → parameter values, 42/42 live); Build/Load Office System | Values cited to a spec clause; IDS derived from the LOD matrix |
| 12 | MEP | Endra (electrical, SHIPPING); MEPAIA (BETA); SysQue/EVOLVE (fabrication) | MEP Openings (never run live) | Not Sentinel's fight now; keep openings and coordination |
| 13 | Views, sheets, tags, schedules | Glyph, DiRoots, SWAPP, Mira, Autodesk MCP | Annotate Views (empty plans) | Commodity. Not a differentiator |
| 14 | Check and hand over (IDS, COBie, IFC) | Horizun deliver_ifc; Archi IDS + BCF; DiRoots; Speckle validation | IDS gate, COBie export, ledger, federation gate: **a Sentinel strength** | Run the check at each modelling step, not only at hand-over |
| 15 | Keep concept and DD in sync | Snaptrude (element-ID deltas); Horizun DWG revision update; Monta (claim). Hypar overwrites; Forma is one-way; Motif has no write-back | None | A revision update that respects manual edits and never auto-deletes |

**Reading the table.**

- Steps 1–3 and 5–6 are well served at LOD 200.
- Steps 4, 7–9 and 15 are thin.
- Step 9 is the heart of the move from concept to DD, and nobody ships it as a governed product.
- Steps 11 and 14 are where Sentinel is already strong.

---

## 6. Where Sentinel can be the best

### 6.1 The vision in one line

**Any tool can make a concept. Sentinel turns it into your office's DD model, checked against the project's rules before anything lands, with a receipt for every element.**

### 6.2 Principles

1. **Any input, one governed path.** DWG, PDF, photo, brief, a massing, a Forma/Snaptrude/Hypar export, or the output of an AI agent (Veras, Geopogo, Claude, GPT-6 Astra). All of it goes through the same propose → check → tick → write → ledger path.
2. **Typed by the office.** Never a generic element that only looks right. The type comes from guideline@n and type_catalog@n, or a named gap is shown.
3. **Checked before it lands.** The project's IDS, contract and LOD matrix are checked **before** the Revit transaction.
4. **Proposed, then approved.** One Undo per action. A ledger receipt carries the actor, the source and the reason.
5. **LOD tracked per element.** Every element knows its current LOD and its target for the stage.
6. **Measured honestly.** Edit cost, minutes and tokens are published per run.
7. **Do not compete on raw generation.** Frontier models get better every month. Sentinel should *use* them, and govern and progress what they make.

### 6.3 Capabilities

Size key: **S** = days, **M** = 1–3 weeks, **L** = 1–2 months, **XL** = a quarter or more (or a partner).

| # | Capability | Value | Size | Depends on | What proves it live |
|---|---|---|---|---|---|
| C1 | **Ghost correctness pack**: hosted doors and windows that cut walls and are sized from the drawing; walls from level to level; wall joins; placed count checked against proposed count before commit (GHB-1, GHB-2) | Removes the "cardboard model" complaint from Sentinel's own output | S–M | ElementPlacementFactory, WallPairing, DatumBuilder | A live drill on the ghost-sample plus one real pilot DWG: every door cuts its wall, walls reach the next level, and placed = proposed |
| C2 | **Ledger and element provenance for every modelling write.** Each element is stamped with source file hash, layer or page/region, rule id, confidence, approver and LOD target. One ledger row per changeset | Closes spec Decision 3. Answers "where did this wall come from?", a question nobody on the market answers with a multi-user, hash-chained record | M | Ledger (Supabase), resolveActor, extensible storage or a Sentinel shared parameter | Pick any wall in Revit, see its source and approver, and the ledger row verifies in the web app |
| C3 | **Changeset vocabulary v2**: roof, hosted door and window, opening, room, column, beam, curtain wall, ceiling, stair (by type); batches above 200; a preview before commit | The executor that every other capability needs. It also lets any MCP agent build through Sentinel's gate | M | changesets-logic.mjs, ChangesetExecutor.cs, IDS gate | A Claude agent builds a two-storey house through Sentinel tools only; every element passes the IDS gate; one Undo removes it all |
| C4 | **LOD matrix artefact and per-element LOD/LOI state.** A `lod_matrix@n` per project (element class × stage → LOD and required properties), derived from the BEP/EIR/LOIN. dotBEP is a useful format model | Makes LOD a checkable fact, not a label. Directly answers "models rejected for the wrong LOD" | M | Artefact system (like guideline@n), IDS compile, Next strip | The web app and the Revit pane show, for example, "Level 3: 212 walls at LOD 200, 38 at 300, 14 blocked, with reasons" |
| C5 | **Promote (LOD 200 → 300 engine).** Reads the model, the spec and type catalogue, and the LOD matrix. Proposes a per-element plan (generic → office type) that cites the spec clause or catalogue row. Ambiguous items go to an exception queue instead of being guessed. Runs the IDS check before commit, writes in one Undo, records in the ledger. Starts with walls, floors, roofs, doors and windows | The least-served step on the market (Monta BETA, SWAPP enterprise only). Deterministic, so low AI risk. Uses Sentinel's existing type engine | L | C1–C4, GuidelineMatcher, GhostTypeCreator, FixInPlaceService | On aster-tower or a Forma BD export with generic walls: IDS pass rate before and after; number of flagged exceptions; minutes taken; zero unattributed changes; Undo works |
| C6 | **Massing to shell.** Revit masses, or Forma, Snaptrude, Hypar and IFC exports, become typed walls, floors and roofs per level; facade rules add curtain walls | Rides the concept-platform wave instead of competing with it. Every concept tool ends at generic LOD 200, and this picks up from there | M–L | C3, C5, DatumBuilder | A Forma BD export turns into a level-bound, office-typed shell in one reviewed changeset |
| C7 | **Rooms, areas, and finishes from rooms** | Table-stakes element classes for DD | M | C3 | Rooms placed and named from drawing text; the IDS room checks pass |
| C8 | **Cores and stairs from rules**: riser/tread tables, egress widths, shaft sizes, stair types chosen from the catalogue | A wide-open gap. "Deliver the core and shell" | L | C3, C5, code tables as an artefact | A stair that passes Revit's stair rules and the IDS, and a core placed per level on a pilot model |
| C9 | **Vector PDF reader.** PDF paths become lines in the Ghost pipeline; scale is read from a dimension or scale bar; title block cropped; confidence per element; overlay review | Reaches the drawing sets clients actually send | M–L | Ghost pipeline, C1, C2 | Three real PDF sets, with edit cost measured (C11) |
| C10 | **Raster / scan plan reading.** Partner (WiseBIM, AmpliFY API) or open models (RoomFormer, HEAT) | Existing buildings and scans | XL | C9 | A partner or model running through the same governed path |
| C11 | **Edit-cost scoreboard.** Counts what people delete, move or retype within N days of acceptance, per input type and per rule. Uses the ledger | Honest accuracy data does not exist on the market. This becomes marketing Sentinel can prove | S–M | C2 | A published number per run and per source type |
| C12 | **Cost and time receipt per run**: minutes, model calls, tokens, elements | The #2 comment question | S | C2 | A receipt row in the ledger for every changeset |
| C13 | **DWG/PDF revision update.** Diffs revision A against B, protects manual edits, and never auto-deletes | Keeps concept and DD in sync. Horizun already has it | M–L | C2 (provenance), C9 | Revision B of a pilot DWG updates 30 walls, preserves 5 hand-edited ones, and flags 2 deletions for a person |
| C14 | **Photo Massing v2**: multi-view, one known dimension, footprint polygon, and every field marked observed or inferred | Fixes F46. Answers "the photo has no scale" | M | Current MassingPlanner | The F46 tower returns within ±10% of 38 storeys when one known dimension is given |
| C15 | **Governed recipe registry**: a verified run becomes a named recipe after approval by two people with different roles; lineage recorded in the ledger | Different from Horizun, whose approval sits inside one agent session | M | C2, ledger roles | A recipe approved by two accounts and run by a third, with full lineage |
| C16 | **Agent entry points**: MCP tools mapped to C3, and WebMCP in the That Open web app | Let any agent use Sentinel, under the same governance | S–M | C3 | Claude drives both Revit and the web app, and every write lands in the ledger |

**Also important:**

- **Revit versions.** Test live on Revit 2025–2027, not only 2024. That is where the market is.
- **Read Horizun before you build C9 or C13.** It is Apache-2.0 and its DWG and verified-write contracts are good. Learn from it. Keep Sentinel's value in what Horizun lacks: multi-user identity, the web CDE, per-element LOD state, and approvals across people and roles.

### 6.4 Competitive position after C1–C6

| | Monta | SWAPP | Horizun | Archi Automate | Geopogo / Veras | **Sentinel (target)** |
|---|---|---|---|---|---|---|
| Office types from a governed catalogue | Firm families | Firm standards | Requirement set | — | Pre-loaded families | **Yes (guideline@n, type_catalog@n)** |
| Check before commit | "Verification layers" | Review steps | Rehearse + IDS | Dry-run | Advice only | **IDS + LOD matrix gate** |
| Per-element provenance | Not shown | "Traceable" | CAD stamps | Step log | None | **Yes, in the ledger** |
| Multi-user, identity-bound, hash-chained record | No | No | Single machine | Log | No | **Yes** |
| LOD state per element vs stage target | No | No | No | No | No | **Yes (C4)** |
| Open to any generator or agent | No | No | Yes | Yes | Own agent | **Yes (C3, C16)** |
| Price and access | Sales-led | Enterprise | Free | €99/year | $250 / beta | To decide |

---

## 7. Options

### Option A: "Promote first" (the concept → DD progression engine)

- **What:** Build C1, C2, C4, then C5, then C6, with C3 as the executor. Take any concept model and raise it to LOD 300 by the office standard, with a plan, an IDS check, one Undo and a ledger receipt per element.
- **Why:**
  - It is the least-served step on the market.
  - It is mostly deterministic (type substitution plus rules), so the AI risk is low.
  - It uses what Sentinel already has: the type engine, the IDS gate, Fix in Revit and the ledger.
  - It takes output from every concept tool and every AI generator instead of competing with them.
- **Trade-offs:**
  - It depends on good office type-catalogue data.
  - The demo is less flashy than photo-to-model.
  - Monta may ship first.
  - It needs a real concept model to prove it.
- **First steps:** see the options list below.

### Option B: "Drawings first" (DWG/PDF → a DD-ready model)

- **What:** C1, C2, C9, C11, C13, C7, and later C10 through a partner. Make Ghost a real converter that is typed by the office from day one.
- **Why:**
  - Offices have piles of 2D legacy drawings, and demand is loud ("a week to model a PDF set").
  - Office typing plus governance beats plain layer mappers.
- **Trade-offs:**
  - The market is crowded and cheap: WiseBIM $49/month, AmpliFY free, Nexar Plan £50/month, BIMify free, and Horizun free with provenance.
  - Accuracy is 60–85% for everyone.
  - Raster reading is XL work.
  - It needs a lot of real test drawings.

### Option C: "Governed agent first" (AI agent + a governed tool API)

- **What:** C3, C12, C15, C16, C2. Let Claude, GPT-6 Astra or any agent build through Sentinel's gate.
- **Why:**
  - Generation is becoming a commodity.
  - Autodesk leaves geometry creation to third parties.
  - "Can I trust the write?" is the loudest question in the comments.
  - Sentinel already has the seam (sentinel_propose_changeset).
- **Trade-offs:**
  - Horizun already ships verified writes and ISO 19650 containers for free, and Archi Automate sells a governed hub for €99/year. Sentinel would be one more connector.
  - Model quality depends on the LLM.
  - Demos are won by whoever has the newest model.

### Recommendation

**Choose Option A, and use the vocabulary part of Option C (C3) as its executor.**

- Option A is where the market is empty and where Sentinel's existing strengths (office typing, IDS gate, ledger, Fix in Revit) matter most.
- It turns every competitor's output into Sentinel input.
- Start with the foundations, because Promote cannot be trusted without them: C1 hosted openings and full-height walls, C2 ledger rows and provenance for every modelling write, and C4 an LOD matrix with per-element LOD state.
- Then prove C5 Promote on walls only, on one real concept model. That can be aster-tower or a Forma Building Design export.
- Measure IDS pass rate before and after, flagged exceptions, minutes and edit cost.
- Add C6 (massing to shell) next.
- Improve drawing input (C9 vector PDF) after Promote works. Partner for raster rather than building it.
