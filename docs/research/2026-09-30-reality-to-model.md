# Reality to model — point clouds, photos and drawings to a native Revit model

Sentinel research note. Date: 2026-09-30. Written for the founder and the BIM team.

---

## 0. How to read this

**The question.** Can Sentinel turn a point cloud of an existing building, or any other asset, into a native Revit model? Native means typed walls, floors, roofs, doors, windows, columns and stairs, not a mesh. It should use every source together: the point cloud, the user's photos, more photos found online, and DWGs/PDFs. The result must follow the office's standards: ruleset@n, guideline@n, the type catalogue, naming@n and the IDS/contract.

**The short answer.** Yes. Build it as a new source inside Ghost Builder, not as a new engine. Keep detection modest and honest. Sentinel's value is governance: evidence, typing to the office standard, review, and a ledger receipt. Section 6 has the design and section 7 has the plan.

**Maturity labels**

| Label | Meaning |
|---|---|
| SHIPPING | You can buy or download it today. |
| BETA | Available, but the vendor calls it beta. |
| DEMO | A public demonstration or experiment. Not a product. |
| RESEARCH | A paper, a model or research code. |
| UNKNOWN | Marketing only, or not enough evidence. |

**Sources.** Every claim links to a page a researcher opened. A second checker reopened most of them. "(not re-verified)" means only the first researcher read the page. Vendor numbers, such as time saved or accuracy, are the vendor's claims, not our measurements. Sentinel code facts come from the repository on 2026-09-30, and the file paths are given.

**Quotes.** Most statements are close paraphrases. Open the link for the exact words.

**Law and licences.** Sections 4 and 5 discuss terms of service, copyright and model licences. **This is not legal advice. Confirm with counsel** before Sentinel fetches, stores or uses third-party content or model weights.

**Prices** are as seen on 2026-09-30. They change.

---

## 1. What the trigger post really shows (CRXAI)

The post is by Mustafa Al-Adhami (CyberRealityX), published 2026-09-28 ([LinkedIn](https://www.linkedin.com/posts/mustafa-al-adhami_ai-aec-scantocad-ugcPost-7510429580160274433-wIdR)). He tested how far AI can go in a real scan-to-CAD workflow.

**The steps**
1. A drone captured a point cloud.
2. He cleaned the cloud in Autodesk ReCap.
3. He took an orthographic elevation view of the cloud. CRXAI turned that view into a technical drawing reference image.
4. Codex, an AI coding agent briefed like a CAD technician with AutoCAD access, drew editable 2D CAD from that reference.

**The result:** editable 2D DWG lines for one elevation. Maturity: **DEMO**.

**Where it stops**
- It is 2D and covers one elevation. There is no 3D.
- It runs in AutoCAD, not Revit. It produces no walls, floors or doors as elements, and no types.
- It uses one source, the cloud. No photos and no drawings.
- It has no standards: no catalogue, no naming and no IDS.
- The author says the flow does not replace technical review. The point cloud stays the source evidence, and the output still needs checking.
- A commenter replied that their real problem is point cloud to Revit. That is the gap this note covers.

CRXAI itself is sold as a Revit add-in for AI visualisation and rendering ([crxai.app](https://crxai.app), [Autodesk Marketplace](https://marketplace.autodesk.com/apps/08220b37-e108-4964-8721-8befa3dfe841)) (not re-verified). The scan-to-CAD flow is an experiment, not a product.

**Lesson for Sentinel.** Do not copy this route for Revit geometry. An AI agent drawing in a CAD tool is hard to repeat and hard to check. Sentinel should place elements with deterministic code from structured proposals. AI may fill attributes such as "brick" or "external" from photos and PDFs. AI must never set geometry.

---

## 2. The market

### 2.1 Scan-to-BIM tools: point cloud to Revit or IFC elements

| Tool (vendor) | What it creates | How automatic | Maturity | Price seen | Sources |
|---|---|---|---|---|---|
| FARO As-Built for Autodesk Revit (FARO, owned by AMETEK since 21 July 2025) | Native Revit elements and families | You pick a fitting tool for each element. The release notes make no AI or auto-detection claims. Reads only ReCap RCS/RCP. Version 2026.0 supports Revit 2025.5, 2026.5 and 2027. | SHIPPING | Not published | [release notes](https://knowledge.faro.com/Software/As-Built/As-Built_for_Autodesk_Revit/Release_Notes_for_As-Built_for_Autodesk_Revit), [AMETEK](https://www.ametek.com/newsroom/news/investor/2025/july/ametek-completes-acquisition-of-faro-technologies) |
| ClearEdge3D EdgeWise Lite / Pro | Native Revit family objects, with EdgeWise's own types. Also Plant 3D and AVEVA E3D (Pro). | Lite: you select an element and it fits it to spec. Pro: automatic extraction of pipes, structure, ducts, walls, conduit and cable trays. | SHIPPING | Lite USD 1,995/year. Pro on request. | [EdgeWise](https://www.clearedge3d.com/products/edgewise/), [Lite](https://www.clearedge3d.com/edgewise/edgewise-lite-point-cloud-to-revit-ready-as-built-modeling-just-1995-usd-year/) |
| ClearEdge3D Verity | Checks an existing model against the scan. Colours elements in or out of tolerance and can generate as-built geometry for elements that deviate. | Automatic, per element | SHIPPING | Not published | [Verity](https://www.clearedge3d.com/products/verity/) |
| Aurivus | Walls (1-click confirm). Doors and windows swapped for the closest family in your own Revit library. Automatic levels. | AI proposes, and the modeller accepts step by step | SHIPPING | Quote or pay per use (not re-verified) | [time-saver page](https://aurivus.com/scan-to-bim-time-saver-ai/), [BIM page](https://aurivus.com/industries/bim-2/) |
| Leica CloudWorx for Revit + Cyclone 3DR | Pipes, steel, walls, floors, members, doors and windows, using project types | Semi-automatic fitters in Revit. AI point classification in 3DR. | SHIPPING | Not published | [CloudWorx](https://leica-geosystems.com/products/laser-scanners/software/leica-cloudworx/leica-cloudworx-revit), [3DR AI](https://leica-geosystems.com/products/laser-scanners/software/leica-cyclone/leica-cyclone-3dr/ai-classification-in-leica-cyclone-3dr-pt1) |
| Trimble RealWorks | Pipes as native Revit objects only | Semi-automatic | SHIPPING | Licence or subscription | [12.3 notes](https://help.fieldsystems.trimble.com/realworks/12.3.htm) (not re-verified) |
| Undet for Revit | Walls, columns, openings, floors, ceilings and families. Writes a per-element Modelling Tolerance parameter. Converts resized door/window instances into types named `[Width]x[Height]mm`. | You pick points. Floors and ceilings are automatic. | SHIPPING | EUR 199/month (EUR 139 in the September sale). EUR 1,200 and EUR 2,500 tiers. | [product](https://www.undet.com/undet-products/undet-for-revit-point-cloud/), [release post](https://www.undet.com/new-release-undet-for-revit-2026/) |
| PointCab Origins + 4Revit | Walls, doors, windows | Manual picks, then live transfer to Revit | SHIPPING | Not verified | [PointCab](https://pointcab-software.com/en/point-cloud-software/revit-point-cloud-plugin/) (not re-verified) |
| As-Built Tools (DG Modelling); PointCloud to Surface Suite (ADB3D) | Walls, doors, windows, stairs, columns; walls, floors, roofs and toposolids from snapped points | Manual-assisted. As-Built Tools creates new types automatically when it needs them. | SHIPPING | As-Built Tools USD 125/month. Surface Suite USD 119 (not re-verified). | [Marketplace 1](https://marketplace.autodesk.com/apps/a0ae2b71-5918-49e2-8912-aa9fcb083fe8), [Marketplace 2](https://marketplace.autodesk.com/apps?id=4860909640426473042&appLang=en&os=Win64) |
| Autodesk ReCap Pro 2026/2027 + ReCap Mesh for Revit (PointFuse technology) | Mesh layers that carry a Revit category, and mesh families. Not parametric walls or floors. | Segmentation is automatic. Classification is manual, with templates. Autodesk warns against adding layers with more than a few thousand elements. | SHIPPING | ReCap Pro subscription | [Add to Document](https://help.autodesk.com/cloudhelp/ENU/Reality-Capture/files/Scan_to_Mesh_Options/Scan_to_Mesh_Local/Revit_Scan_Mesh/scan_to_mesh_revit_add_doc.html), [What's new](https://help.autodesk.com/cloudhelp/ENU/RealityCapture-New/files/whats_new_recap.html), [ReCap Pro 2027](https://www.autodesk.com/blogs/aec/2026/07/30/whats-new-in-recap-pro-2027/) |
| Matterport BIM File | RVT and IFC at LOD 200, interiors only, with Matterport's families | A service. The split between automation and people is not disclosed. | SHIPPING | Priced per floor area (not verified) | [Matterport BIM](https://matterport.com/bim), [reseller FAQ](https://www.360virtualtour.co/matterport-bim-file/) |
| Canvas (now Twindo) | RVT and other CAD formats | Service using AI plus people | SHIPPING | USD 0.14/sqft for 2D, USD 0.26/sqft for 3D (Essentials) | [pricing](https://support.canvas.io/article/8-what-does-all-of-this-cost) |
| Polycam | RVT, DWG | Human modelling service | SHIPPING | Revit from USD 200 | [AEC Magazine](https://aecmag.com/technology/polycam-for-aec/) (not re-verified) |
| ScanToBIM-CAD | IFC + DXF, not RVT | Unattended AI, delivered within 24 hours at most. Its own guide suggests swapping the generic IFC elements for your standard Revit families. | SHIPPING | USD 29 per scan | [site](https://www.thescantobim.com/), [Revit guide](https://www.thescantobim.com/blog/point-cloud-to-revit) |
| Pointorama | IFC + DXF, not RVT | One-click detection of floors, rooms, doors and windows, then review | SHIPPING | EUR 49 per project. EUR 41/month for 2 projects. | [pricing](https://pointorama.com/pricing) |
| BricsCAD BIM Scan2BIM | Walls, slabs and openings in BricsCAD (IFC export) | Automatic steps, and the user confirms each one | SHIPPING | BricsCAD licence | [Bricsys](https://help.bricsys.com/en-us/document/bricscad/point-cloud/point-cloud-scan-to-bim-workflow) (not re-verified) |
| ODA Scan-to-BIM SDK | IFC walls, slabs, openings and sloped roofs | Automatic recognition plus correction tools. A real closed-door scan needed significant manual work. Does not read E57 or PTX. | BETA | ODA membership. 60-day trial. | [ODA](https://www.opendesign.com/products/scan-to-bim) |
| Cloud2BIM (CTU Prague) | IFC slabs, walls, openings, zones | Automatic batch run. Needs tuning. | RESEARCH (MIT) | Free | [GitHub](https://github.com/VaclavNezerka/Cloud2BIM), [paper v2](https://arxiv.org/html/2503.11498v2) |
| ConstrIQ Cloud2BIM-AI | IFC | AI detection plus GUI check | DEMO (availability unclear) | Not published | [ConstrIQ](https://constriq.tech/point-cloud-to-bim) |
| WiseBIM AI for Revit (drawings, not scans) | Native Revit walls, doors, windows and slabs from DWG, DXF, PDF or images | Automatic after you scale the plan. Walls are typed by interior/exterior and thickness. | SHIPPING | Not stated | [AEC Magazine](https://aecmag.com/ai/ai-generates-revit-models-from-2d-plans/) |
| Cintoo, NavVis IVION add-in, Pointly | No elements. Viewing, tagging and classification only. | n/a | SHIPPING | Subscription | [Cintoo](https://cintoo.com/en/bim-edition), [NavVis](https://www.navvis.com/ivion/scan-to-bim), [Pointly](https://www.pointly.ai/) |
| ScantoBIM Plugin, Nest3D | Revit elements are claimed | Not documented | UNKNOWN | Not published | [scantobimplugin](https://scantobimplugin.com/), [Nest3D](https://www.nest3d.ai/revit-point-cloud-plugin) |
| SpatialLM, SceneScript | A text layout of walls, doors and windows, not IFC or RVT | Automatic | RESEARCH, non-commercial weights | Free for research | [SpatialLM](https://github.com/manycore-research/SpatialLM), [SceneScript](https://github.com/facebookresearch/scenescript) |
| Autodesk AI scan-to-BIM direction (AU 2026) | Nothing shipped yet | Announced: tolerance-controlled extraction and AI classification | RESEARCH | n/a | [GeoWeek News](https://www.geoweeknews.com/articles/the-real-au-news-was-underneath-the-ai/) |

### 2.2 What the table tells us

- **What is automatic today.** Pipes, ducts, conduit and steel are fitted against size catalogues: EdgeWise, RealWorks, Cyclone 3DR. EdgeWise Pro extracts walls automatically too. Aurivus proposes walls for a 1-click confirm and picks doors and windows from your own library.
- **Automatic, but not to RVT.** Floors, rooms, doors and windows reach IFC or DXF automatically in Pointorama, ScanToBIM-CAD, BricsCAD, ODA and Cloud2BIM. The output is generic and untyped.
- **Most Revit add-ins are still point-and-fit.** FARO As-Built, CloudWorx, Undet, PointCab, As-Built Tools and Surface Suite work one element at a time.
- **Nobody types to the office's own standard.** Aurivus uses the closest family by shape. EdgeWise exports its own types. As-Built Tools creates new types when needed. Undet names types `[Width]x[Height]mm`. WiseBIM names wall types by interior/exterior and thickness. ScanToBIM-CAD tells you to swap generic elements yourself. None checks the result against a firm's catalogue, naming or IDS. **This is Sentinel's opening.**
- **Autodesk's path is mesh.** ReCap brings category-tagged mesh into Revit. The AU 2026 direction points to AI classification, but nothing has shipped.
- **Every tool keeps a person in the loop.** Examples: Aurivus step-by-step acceptance, ODA's correction tools, human services at Matterport, Canvas and Polycam, and the CRXAI author's own warning.
- **Accuracy on the element is rare.** Only Undet writes a per-element tolerance parameter into Revit. Verity colours elements by tolerance.
- **The market is consolidating.** AMETEK bought FARO (about USD 920 million net of cash). Autodesk bought the PointFuse IP in March 2024 and shipped it in ReCap Pro 2026 ([pointfuse.com](https://pointfuse.com/)). Sentinel should not depend on one extractor.

### 2.3 Multi-source and fusion products

| Product | Sources it combines | Output | What it does not do | Maturity | Source |
|---|---|---|---|---|---|
| Matterport BIM File | LiDAR camera cloud + panoramas | RVT/IFC LOD 200 of interiors, plus RCP/RCS | The reseller FAQ says the information is approximate and that exteriors are out of scope. With interior-only scans it assumes a standard wall thickness. It is not code-compliant or permit-ready. It is not typed to your standards. | SHIPPING | [matterport.com/bim](https://matterport.com/bim), [reseller FAQ](https://www.360virtualtour.co/matterport-bim-file/) |
| NavVis IVION + Revit add-in | Cloud + panoramas, shown next to the Revit model | Nothing is extracted | No modelling. The vendor claims 10% less modelling time and up to 5 mm absolute accuracy. | SHIPPING | [NavVis](https://www.navvis.com/ivion/scan-to-bim) |
| Bentley iTwin Capture Modeler | Photos + LiDAR + video + 360 | Reality mesh, splats, clouds | Not BIM | SHIPPING | [Bentley](https://www.bentley.com/en/products/itwin-capture-modeler/) (not re-verified) |
| PIX4Dmatic | Phone LiDAR depth + photogrammetry | Fused cloud, mesh | Reality data only | SHIPPING | [Pix4D](https://www.pix4d.com/blog/pix4dmatic-fusion-lidar-photogrammetry-point-clouds) (not re-verified) |
| Reconstruct | 360 + photos + drone + scans | Clouds, plans, overlays | The vendor's own study found about 1 inch average error measuring with an image overlay, against about 4 inches on the cloud alone. Not peer-reviewed. | SHIPPING | [Reconstruct blog](https://blog.reconstructinc.com/reconstruct-inc/maximize-measurement-accuracy-with-images-overlaid-on-point-clouds-dca828f4a539) (not re-verified) |
| Hover | Phone photos of the exterior | SKP, DXF, DWG | Exterior only. Accuracy claim of plus or minus 5% to the nearest inch. | SHIPPING | [Hover](https://hover.to/architects/) |
| EagleView, Nearmap AI, Esri LOD2 | Aerial imagery (+ footprints and heights for Esri) | Exterior measures, roofs, LOD2 shells | Exterior only | SHIPPING | [EagleView](https://www.roofingcontractor.com/articles/101950-eagleview-launches-complete-exterior-remote-first-3d-property-intelligence), [Nearmap](https://developer.nearmap.com/docs/ai-api), [Esri](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/3d-analyst/extract-lod2-buildings.html) |
| Apple RoomPlan | iPhone/iPad LiDAR + camera, on the device | Parametric room (walls, doors, windows, 16 object types), USDZ | Rooms up to 15 x 15 m and 3.6 m high. Apple reports 95% precision and recall for walls and windows and 90% for doors, measured on 2D boxes. | SHIPPING | [Apple research](https://machinelearning.apple.com/research/roomplan) |
| Canvas | Scan OR floor plan (alternatives, not fused) | RVT and others | Does not combine the two sources | SHIPPING | [Canvas](https://canvas.io/how-canvas-works/) |
| Undet for Revit | Scan + scanner photos | Model overlaid on photos for QA | Photos are used only for checking | SHIPPING | [Undet](https://www.undet.com/new-release-undet-for-revit-2026/) |
| OpenSpace, DroneDeploy, SKAND | 360 walks, drone, robots | Progress tracking, detections, comparison with design | No BIM authoring | SHIPPING | [OpenSpace](https://www.openspace.ai/products/progress-tracking/), [DroneDeploy](https://www.dronedeploy.com/blog/dronedeploy-unveils-agentic-ai-and-robotics-products-at-horizons-2025), [SKAND](https://skand.ai/) |

**Finding.** No shipping product combines point cloud, own photos, internet photos and DWG/PDF into native Revit elements typed to the office's own standards. Each covers one or two sources. Capture-time fusion works well, for example E57 files with registered panoramas. Fusing sources at the level of each element does not exist as a product.

---

## 3. What is reliable today and what is still research

Each step below has four parts: what works today, what is still research, realistic accuracy, and where a person must review.

### 3.1 Registration (putting all sources in one coordinate system)
- **Reliable today.** Scan-to-scan registration in scanner software. E57 files that already carry registered panoramas (Matterport, NavVis, Leica). Photos exported by the scanner come with their poses (not re-verified).
- **Workable with care.** Other photos: COLMAP gives camera poses at an unknown scale ([COLMAP](https://github.com/colmap/colmap)). TEASER++ (BETA) then solves scale, rotation and translation to the scan ([TEASER++](https://github.com/MIT-SPARK/TEASER-plusplus)), and Open3D ICP refines the fit ([Open3D](https://www.open3d.org/docs/release/tutorial/pipelines/global_registration.html)). Drawings: a 2D similarity fit (OpenCV `estimateAffinePartial2D`) plus a two-point check by a person.
- **Still research.** Sparse internet photos. A 2026 paper treats them as very hard for current 3D methods, although fine-tuning helps ([arXiv 2604.22714](https://arxiv.org/abs/2604.22714)). Fully automatic scan-to-BIM registration succeeded in 55% to 100% of sessions in one study ([SLABIM](https://arxiv.org/abs/2502.16856)) (not re-verified).
- **Accuracy.** A 1 degree rotation error moves geometry about 0.87 m at 50 m.
- **Human review.** A person must confirm every transform, with the RMSE shown.

### 3.2 Segmentation (deciding which points are wall, floor, door and so on)
- **Reliable today.** Plane finding and density slicing. These are geometry methods and need no training data.
- **Still research.** Learned segmentation. Point Transformer V3 scores about 77 to 79 mIoU on ScanNet v2 but only 35.2 on the harder ScanNet200 ([PTv3](https://arxiv.org/html/2312.10035v2)) (not re-verified). One study found that mIoU above 65% is enough for reliable walls ([Buildings 2025](https://www.mdpi.com/2075-5309/15/7/1126)) (not re-verified).
- **Licence trap.** Most pretrained weights come from ScanNet, whose terms allow non-commercial research and education only ([ScanNet ToS](http://kaldir.vc.in.tum.de/scannet/ScanNet_TOS.pdf)). See section 5.
- **Human review.** Rare objects and clutter are often misclassified.

### 3.3 Walls, floors and ceilings
- **Reliable today.** Straight walls, slabs and levels in rectilinear buildings. Cloud2BIM reports deviations up to 25 mm on real data, running on a CPU laptop. It processed 40 million points in 30 minutes and ran at 6.9 million points per minute on a 7 million point set ([Cloud2BIM v2](https://arxiv.org/html/2503.11498v2)). EdgeWise Pro extracts walls. Aurivus proposes walls for a 1-click confirm. Undet automates floors and ceilings.
- **Limits.** Cloud2BIM assumes every wall is full storey height, so it cannot detect shorter walls. It approximates curved walls with straight segments.
- **Still research.** Fully automatic whole-building models. In the CV4AEC 2023 challenge the best 3D average IoU was 0.431 and the wall IoU only 0.362. The best F1 at 5 cm was 0.475 ([CV4AEC](https://github.com/cv4aec/cv4aec.github.io/blob/main/cvpr2023.md)). BIMStruct3D (2026) reached a mean wall 3D-IoU of 31.0% on the same data ([arXiv](https://arxiv.org/html/2604.24311v1)).
- **Human review.** Every wall row. Pay extra attention to thin partitions, glass, low walls and areas the scanner could not see.

### 3.4 Openings (doors and windows)
- **The physical limit.** A door that was closed during the scan looks like a wall. ODA states that no algorithm can recover it ([ODA](https://www.opendesign.com/products/scan-to-bim)).
- **Reliable today.** RoomPlan on phones for small rooms: 95% for windows and 90% for doors (2D boxes). Aurivus places doors and windows from your library after you accept them.
- **Still research.** Image-based methods reach 72% to 82% IoU on openings ([Wong et al. 2025](https://www.repository.cam.ac.uk/items/605f8322-7e77-4aa3-b127-c63f1e2fddf7)) (not re-verified). BIMStruct3D reaches 22.9% door 3D-IoU and found no doors at all in one scene. SpatialLM's zero-shot F1 is about 49 for doors and 47 to 51 for windows ([SpatialLM](https://github.com/manycore-research/SpatialLM)).
- **What this means.** Openings are where drawings and photos add the most value. A drawing shows the closed door. A photo confirms the window.
- **Human review.** Every opening.

### 3.5 Levels and grids
- **Reliable today.** Levels from a height histogram of the points (the Cloud2BIM method). Aurivus sets levels automatically. EdgeWise 5.4 models levels and walls in one click ([Laserscanning Europe](https://www.laserscanning-europe.com/en/blog/clearedge-edgewise-54-released)) (not re-verified).
- **Grids.** None of the tools we checked derives structural grids from a scan. Grids come from drawings, where Sentinel's `DatumFromDrawing.cs` already reads them, or from a person.
- **Human review.** Confirm level names and elevations against naming@n.

### 3.6 MEP
- **Reliable today.** Pipes, ducts, conduit and cable trays in EdgeWise Pro, RealWorks and Cyclone 3DR Scan to Pipe. These tools are strong for industrial plant.
- **Recommendation.** Buy, do not build. Re-type their output through Sentinel's standards (phase 6).

### 3.7 Stairs and roofs
- **Today.** Mostly manual. As-Built Tools sets a stair height in two clicks. ODA recognises sloped roofs (BETA). Aurivus detects roofs only so it can hide them in the 360 view.
- **Revit API.** Revit can create both: `StairsRun.CreateStraightRun` inside a `StairsEditScope`, and `NewFootPrintRoof`.
- **Recommendation.** Treat them as manual rows, with a scan slice shown beside the proposal.

### 3.8 Materials and types from photos
- **Reliable today.** A vision-language model can sort a photo into fixed categories such as brick, render, glass or internal/external. Qwen3-VL runs locally through Ollama ([Qwen3-VL](https://github.com/QwenLM/Qwen3-VL)).
- **Not reliable.** Dimensions from a vision-language model. Sentinel's own simulation found this (SIM F46). Geometry from photos is also about twice as bad as laser: 0.120 m RMSE for UAV photos against 0.070 m for a terrestrial laser scanner ([ISPRS 2025](https://isprs-annals.copernicus.org/articles/X-5-W4-2025/143/2026/)) (not re-verified). Hover claims plus or minus 5%.
- **Human review.** Accept each attribute on its row.

### 3.9 Accuracy language
- Vendors rarely state a formal Level of Accuracy. They give RMS values, colour bands or an LOD.
- The USIBD LOA specification separates measured accuracy from represented accuracy ([USIBD guide C120](https://cdn.ymaws.com/www.nysapls.org/resource/resmgr/2019_conference/handouts/hale-g_bim_loa_guide_c120_v2.pdf)). We did not verify its band values, so read the spec before using them.
- **Proposed metric for Sentinel.** Per-element deviation from cloud to element, reported at 5, 10 and 20 cm (the CV4AEC thresholds). LOD 200 is the default ceiling. Never claim survey grade or permit grade.

---

## 4. Finding evidence on the internet

### 4.1 Short answer for the founder
- **Photos: yes, but only from a short list of licence-clean sources.** For most of them a person must admit each photo.
- **DWGs and PDFs of a specific building: Sentinel should not search the web for them.** Drawings are protected works. The owner, the architect or the municipality holds them. Sentinel asks the owner or their agent to upload them, with a permission statement.
- **Web search gives leads, not evidence.** A lead is a link. It becomes evidence only after a person resolves its licence.
- **No mainstream web image search API is open to a new customer today.**
  - The Google Custom Search JSON API is closed to new customers. Existing customers have until 1 January 2027 ([Google](https://developers.google.com/custom-search/v1/overview)).
  - The Bing Search APIs were retired on 11 August 2025 ([Microsoft](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)).
  - Brave's API terms allow only transient storage of results and forbid derivative works of results ([Brave terms](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service)).
  - Claude's web search tool costs USD 10 per 1,000 searches. It can restrict results to allowed domains or block domains, but not both at once. It has no documented image mode ([Claude docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)).

### 4.2 The source matrix

| Source | May Sentinel fetch it automatically? | May it shape the model? | What to record | Must a person confirm? |
|---|---|---|---|---|
| User's own scans, photos, DWGs, PDFs | Supplied by the user | Yes | Author, date, owner permission, blur status | One attestation per batch |
| OpenStreetMap / Overture buildings (ODbL) | Yes | Outline, and heights where mapped | Credit to OpenStreetMap contributors. Licence as of download. | No |
| Microsoft Global ML Building Footprints | Yes | Outline seed. Middle East quality: 95.7% precision, 85.4% recall, 65.1% IoU. | Release date (refreshed 2026-08-13). Licence depends on where you got it: CDLA-Permissive-2.0 on GitHub, ODbL via Overture. | No |
| Google Open Buildings | Yes | Only where covered. The Middle East is not listed. | CC BY 4.0 or ODbL (your choice) | No |
| Copernicus Sentinel-2 | Yes | Site context only (10 m pixels) | The Copernicus data notice | No |
| Mapillary | Yes, through API v4 | Yes. The commercial terms allow use in services for your clients. Exclude any sets offered under CC BY-NC-SA. | Image id, creator, CC BY-SA 4.0, terms dated 2024-02-15 | One-time acceptance of the commercial terms by a person. You must keep safeguards against re-identification and un-blurring. |
| KartaView | Licence allows it (API terms not verified) | Yes, under CC BY-SA 4.0 | Credit to Grab and KartaView contributors | No |
| Panoramax | Yes | Under each picture's own licence | Per-picture licence | No. Little coverage outside France. |
| Wikimedia Commons | Yes, via the API with a descriptive User-Agent | Yes, for free licences. Commons gives no warranty on licences. | Author, licence, file page URL | Yes, per photo. Especially in countries without freedom of panorama. |
| Flickr (Creative Commons search) | Yes, with an API key | Only photos whose CC licence allows commercial use | Owner, licence, URL. Keep only for reasonable periods. Remove within 24 hours if the owner asks. Show the SmugMug non-endorsement notice. | Yes, per photo |
| Openverse | Discovery only | Only after re-checking the licence at the source | Lead only | Yes |
| Web search (Brave, Claude web search) | Leads only, kept transiently | No, until the licence is resolved | Lead URL | Yes, always |
| Nearmap / Vantor (Maxar) | Only with the office's own credentials | Internal use. 3D and ML uses are restricted (as reported, not re-verified). | Contract reference, delete-by date | Office admin attests |
| Planning or permit drawings (UK registers, US building departments, Greater Amman Municipality) | Never | Only if the user uploads them with permission | Permission letter or owner authority | Yes |
| Google Maps, Street View, Earth, Photorealistic 3D Tiles, Apple Maps, Azure/Bing imagery | Never | No | Nothing | Reject at intake. The user attests that uploads are not captures from these services. |

Sources: [Mapillary terms](https://www.mapillary.com/terms), [Mapillary commercial terms](https://www.mapillary.com/commercialterms), [KartaView terms](https://kartaview.org/terms), [Panoramax](https://en.wikipedia.org/wiki/Panoramax), [Commons reuse](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [Wikimedia User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy), [Flickr API terms](https://www.flickr.com/help/terms/api), [Openverse terms](https://docs.openverse.org/terms_of_service.html), [OSM copyright](https://www.openstreetmap.org/copyright), [Microsoft footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), [Overture attribution](https://docs.overturemaps.org/attribution/), [Google Open Buildings](https://sites.research.google/gr/open-buildings/), [Copernicus notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice), [Nearmap terms](https://www.nearmap.com/legal/product-specific-terms), [Maxar licence form](https://maxar-marketing.s3.amazonaws.com/files/legal/FORM_WW0023F_InternalUseLicense_ver4-21-21.pdf).

### 4.3 Never automate
- Click-through acceptance of any terms.
- Sign-in to municipal or permit portals.
- Scraping search engine results, or bypassing anti-bot protection.
- Downloading from Google, Apple or Azure/Bing map services.
- Un-blurring faces or number plates.
- Training models on content whose terms forbid machine learning.
- Keeping Brave search results beyond transient use.
- Web searches for a specific building's drawings.

### 4.4 The law, in plain words (not legal advice; confirm with counsel)
- **Google Maps Platform terms, section 3.2.3.** They say: "Customer will not create content based on Google Maps Content" ([Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms), last modified 26 August 2026). The listed examples include creating 3D building models from 45-degree imagery, tracing building outlines from the satellite map, and using the content to train, test or fine-tune AI models. Scraping and bulk download are also barred.
- **Google Photorealistic 3D Tiles.** You may overlay your own 3D objects only if they were not derived from the tiles by hand or by machine. Image analysis, object detection and offline use are not allowed ([Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies), updated 2026-09-24).
- **A person looking at Street View or Earth.** Google's Geo Guidelines also forbid digitising or tracing from Street View imagery, analysing it with software, and using Earth output to reconstruct 3D models ([Geo Guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)). So even manual tracing of a screenshot is out.
- **Freedom of panorama.** The Wikimedia Commons table shows buildings may be photographed and reused in the UK, US, Germany and Saudi Arabia. It shows this is not allowed in Jordan, the UAE, Egypt, France or Italy ([Commons FoP](https://commons.wikimedia.org/wiki/Commons:Freedom_of_panorama)). Whether a 3D model falls inside these exceptions is our inference, not verified.
- **Jordan.** The Commons page marks freedom of panorama as not OK. Jordanian copyright law (Law No. 22 of 1992, as amended) protects architecture and plans ([Commons Jordan](https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/Jordan)). We found no public municipal drawing archive at the Greater Amman Municipality ([GAM e-services](https://e-services.ammancity.gov.jo/)).
- **Text and data mining.** In the EU, DSM Directive Article 4 allows copies of lawfully accessible works for text and data mining. The copies may be kept as long as needed. This does not apply when the rightholder has reserved the use, for example in machine-readable form ([Article 4](https://www.legislation.gov.uk/eudr/2019/790/article/4)). In the UK, CDPA section 29A covers only non-commercial research. We found no such exception for Jordan.
- **US permit plans (California example).** Health and Safety Code 19851(a): the official plan copy may be inspected only at the building department. It may not be copied without written permission from the licensed professional (and, per the statute, the owner) ([statute](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=19851)).
- **The real legal basis for as-built modelling is the owner's authority.** Sentinel should collect an owner attestation before any internet search.
- **Privacy.** Interior photos contain people. Blur faces and plates when a photo comes in, and keep no unblurred third-party copies.

### 4.5 What Sentinel must record for every item
A ledger event `evidence.admitted` with these fields:
- `sha256`, `kind` (scan, photo, drawing, dataset), `provider`, `provider_item_id`, `source_url`, `retrieved_at`
- `terms_url`, `terms_version_date` (snapshot the terms version, because terms change)
- `licence` (SPDX id), `attribution_text`
- `allowed_uses`: view_reference, geometry_extraction, texture_embed, redistribute, ml_training
- `jurisdiction` and a freedom-of-panorama flag
- `faces_plates_blurred`, `delete_by`, `attestation_id`, `admitted_by`, `obtained_via`

Rules that go with the record:
- Never embed evidence imagery in the RVT or IFC.
- Write a NOTICE file per model with every credit: ODbL, CC authors, Copernicus, Mapillary, KartaView.
- A bridge job enforces `delete_by`. Expired items keep only their hash and metadata in the ledger.
- Before fetching from the open web, check robots.txt and TDM opt-out signals, and record the result.

### 4.6 Attestations (signed once, in the app)
- (a) I am the owner, or authorised by the owner, of this asset. This is required before any internet search.
- (b) I have the copyright holder's permission for these drawings.
- (c) These are my own photos and scans. People have consented, or their faces are blurred.
- (d) None of these images are captures from Google, Apple or Azure/Bing map services.
- (e) Our commercial licence covers this use and this deliverable.

---

## 5. Revit and pipeline feasibility

### 5.1 Revit point cloud API: the facts
- **Revit links only ReCap RCP/RCS files.** `PointCloudType.Create` takes an engine id or file extension. Autodesk's point cloud team said serious users should use ReCap. They also said the alternative point cloud engine API is deprecated and should not be implemented ([The Building Coder 1222](https://jeremytammik.github.io/tbc/a/1222_point_cloud_api.htm)).
- **Raw scans (E57, LAS, LAZ, PTX) need ReCap to become RCP.** No Revit API indexes raw scans. Third-party tools that read ReCap files need a licensed ReCap installed on the same computer ([Unity docs](https://docs.unity.com/en-us/asset-transformer-sdk/2026.1/manual/io/import-recap)). ODA's SDK reads RCP/RCS but not E57 or PTX ([ODA](https://www.opendesign.com/products/scan-to-bim)).
- **`PointCloudInstance.GetPoints` is sampled and capped.** Each call returns between 1 and 1,000,000 points. If more points pass the filter than you ask for, repeated calls may return different results ([revitapidocs](https://www.revitapidocs.com/2019/6761fd71-e38e-d60f-90f7-9e034bf2d5c0.htm)). Use it for small spot checks, not for processing a whole building.
- **`GetReCapProject`** (Revit 2022+) exposes a ReCap SDK project and needs AdskRcManaged.dll ([revitapidocs](https://www.revitapidocs.com/2022/d309db9b-b523-7dcb-9b76-69d540c1a362.htm)).
- **Revit 2026's reality-capture mesh plugin** brings meshes that can become families, not typed walls ([layer.team](https://layer.team/blog/what-s-new-in-revit-2026)).
- **DirectContext3D** draws points, lines and triangles with no transaction and no change to the model. It is the right tool for a decimated scan overlay and for proposal outlines. Audit items AI-4 and GHB-4 already plan it (`docs/strategy/2026-09-30-revit-addin-audit.md`).
- **DirectShape** creates non-parametric, categorised geometry. Use it only for flagged context geometry. Sentinel already uses it in `ClashManager.cs` and `MepVoidManager.cs`.
- **Native creation APIs** exist for everything we need: `Wall.Create`, `Floor.Create`, `Level.Create`, `Grid.Create`, hosted `NewFamilyInstance`, `NewFootPrintRoof`, `StairsRun.CreateStraightRun` and `Toposolid.Create` (2024+).
- **Opening an IFC in Revit** reportedly produces DirectShape geometry, not native walls. This comes from a single third-party README ([IFC2RVT](https://github.com/AnT1pal/IFC2RVT)) (UNKNOWN). Either way, Sentinel should create elements through its own native executor.

**Conclusion.** Process the cloud outside Revit. Send Revit only typed proposals. Show the scan in Revit in one of two ways: link an RCP if the user has ReCap, or draw a decimated overlay with DirectContext3D.

### 5.2 Building blocks for the processing service

| Block | Job in the pipeline | Licence | Verdict |
|---|---|---|---|
| [PDAL](https://github.com/PDAL/PDAL) | Read E57, LAS/LAZ, PLY, PTX. Filter. Write COPC. | BSD | Use |
| [COPC](https://copc.io/) + [copc.js](https://github.com/connormanning/copc.js) | One indexed, compressed cloud per pack. Web viewing. | Public spec; MIT | Use |
| [libE57Format](https://github.com/asmaloney/libE57Format) / [pye57](https://github.com/davidcaron/pye57) | E57 points, scan poses, embedded images | BSL-1.0 / MIT | Use |
| [laspy](https://github.com/laspy/laspy) | LAS/LAZ | BSD-style | Use |
| [Open3D](https://github.com/isl-org/Open3D) | Planes, clusters, ICP | MIT | Use |
| [OpenCV](https://github.com/opencv/opencv) | Contours on density images. 2D similarity fit. | Apache-2.0 | Use |
| [TEASER++](https://github.com/MIT-SPARK/TEASER-plusplus) | Scale + rotation + translation from photos to scan | MIT (BETA) | Use |
| [COLMAP](https://github.com/colmap/colmap) / GLOMAP | Camera poses from photos | BSD | Use (check dependencies) |
| [hloc](https://github.com/cvg/Hierarchical-Localization) + [LightGlue](https://github.com/cvg/LightGlue) | Locate single photos | Apache-2.0. Avoid the SuperPoint/SuperGlue configurations, which are non-commercial. | Use with care |
| [MapAnything](https://github.com/facebookresearch/map-anything) | Metric geometry from photos | Only the `map-anything-apache` weights are Apache-2.0. The other checkpoints are CC-BY-NC. | Apache weights only |
| [VGGT](https://github.com/facebookresearch/vggt) | Same job | Commercial use only with the VGGT-1B-Commercial checkpoint, and not for military use | Evaluate the licence first |
| [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO) + [SAM 2](https://github.com/facebookresearch/sam2) | Find windows and doors in photos | Apache-2.0 (not re-verified) | Use |
| [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) via Ollama | Material and style categories | Apache-2.0 | Use, for categories only |
| [PdfPig](https://github.com/UglyToad/PdfPig) | Vector paths from PDF drawings | Apache-2.0. Already a Sentinel dependency (`SentinelAddin/Sentinel.csproj`). | Use |
| [ezdxf](https://github.com/mozman/ezdxf) | DXF outside Revit | MIT | Use |
| [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) | Read third-party IFC in the service | LGPL-3.0 | Use as a separate process |
| [Cloud2BIM](https://github.com/VaclavNezerka/Cloud2BIM) | Method reference and baseline | MIT | Use and cite |
| [Pointcept / PTv3](https://github.com/Pointcept/Pointcept) | Learned segmentation | Code MIT. The weights inherit their dataset's terms. | Only with licensable weights |

### 5.3 Excluded from a commercial product (not legal advice; confirm with counsel)
Most of these licences were read by the researcher but not re-checked by the verifier.
- **Non-commercial:** DUSt3R and MASt3R (CC BY-NC-SA 4.0). Inria Gaussian splatting (research licence). CubiCasa5k (CC BY-NC 4.0). Sonata, Concerto, SceneScript and the SpatialLM encoder weights (CC-BY-NC-4.0). Any weights trained on ScanNet.
- **AGPL-3.0:** OpenMVS, OpenDroneMap, PyMuPDF, Ultralytics YOLO.
- **GPL:** CloudCompare (GPL v2+), LibreDWG (GPL-3.0), CGAL (GPL/LGPL or a commercial licence).
- **No licence:** A-Scan2BIM.

Sources: [DUSt3R](https://github.com/naver/dust3r), [MASt3R](https://github.com/naver/mast3r), [gaussian-splatting licence](https://github.com/graphdeco-inria/gaussian-splatting/blob/main/LICENSE.md), [CubiCasa5k](https://github.com/CubiCasa/CubiCasa5k), [Sonata](https://github.com/facebookresearch/sonata), [OpenMVS](https://github.com/cdcseacave/openMVS), [ODM](https://github.com/OpenDroneMap/ODM), [PyMuPDF](https://github.com/pymupdf/PyMuPDF), [ultralytics](https://github.com/ultralytics/ultralytics), [CloudCompare](https://github.com/CloudCompare/CloudCompare), [LibreDWG](https://github.com/LibreDWG/libredwg), [CGAL](https://github.com/CGAL/cgal).

### 5.4 Compute
- **The geometry pipeline runs on a CPU.** Cloud2BIM processed 40.2 million points in 30 minutes on a laptop with a Core Ultra 165H and 32 GB of RAM ([paper](https://arxiv.org/html/2503.11498v2)). This fits the bridge PC at zero cost.
- **Learned models need a GPU.** PTv3 takes 61 ms per ScanNet scene on an RTX 4090 ([PTv3](https://arxiv.org/html/2312.10035v2)). The founder's RTX 4060 (8 GB) is enough for inference on chunks.
- **Cloud GPU is optional.** RunPod listed an RTX 4090 at USD 0.74/hour on 2026-09-30 ([RunPod](https://www.runpod.io/pricing)). Sending a scan off site conflicts with Sentinel's local-by-default rule unless the client opts in.
- **Vision-language models** run locally through Ollama. Sentinel already uses this pattern (`SentinelAddin/GhostBuilder/LocalVisionReader.cs`).

### 5.5 Storage
- Supabase caps a file at 50 MB on the Free plan. On Pro it can be set up to 500 GB ([Supabase](https://supabase.com/docs/guides/storage/uploads/file-limits)).
- Scans are often several GB. Binaries therefore stay on the office disk or NAS. Only the manifest, hashes and small derived products go to the ledger.

---

## 6. The recommended architecture for Sentinel

### 6.1 The answer: extend Ghost Builder, not a new engine
Build **"Reality to model"** as a third source inside Ghost Builder. Today Ghost Builder has two sources: DWG and the evidence folder. The only new heavy part is a local processing service outside Revit.

Why this is the right choice:
- **Sentinel already owns the back half.** Face pairing (`WallPairing.cs`, `GhostWallPairer.cs`). Type resolution from the Office Modelling Guideline and catalogue (`GuidelineMatcher.cs`, and `resolveWithCatalog` in `WebApp/src/sentinel-core/guideline.ts`). Type provisioning (`GhostWallTypeProvisioner.cs`, `GhostFloorTypeProvisioner.cs`, `GhostTypeCreator.cs`). Datum from drawings (`DatumFromDrawing.cs`). The bridge changeset with IDS adjudication and ledger rows (`WebApp/bridge/changesets-logic.mjs`). Review, the Holding Area and placement (`ChangesetExecutor.cs`).
- **The data shapes already match.** Cloud2BIM describes each wall by its start point, end point and thickness ([paper](https://arxiv.org/html/2503.11498v2)). That is the same shape Ghost Builder builds from DWG face pairs. Scan slices can therefore feed the existing path.
- **A new engine would compete with Aurivus, EdgeWise and Autodesk on detection.** That is their home ground, and they are ahead. Sentinel should win on governance instead.

### 6.2 The flow

```
1. Evidence in      scan, own photos, DWG/PDF, admitted internet items
2. Evidence pack    hash, source, licence, permission, registration  -> ledger: evidence.admitted
3. sentinel-survey  local Python job outside Revit -> element proposals with evidence and deviation
4. Type resolve     guideline@n + type catalogue + naming@n -> a type, or a gap (-> Holding Area)
5. Bridge           proposeChangeset: vocabulary check, IDS/contract check, ledger row
6. Revit review     overlay + rows with scan slice, photo crop, drawing crop; tick to accept
7. Placement        ChangesetExecutor per storey, one Undo, proposal_guid stamped -> ledger receipt
8. After            deviation re-check; Federation Gate tolerance rule
```

### 6.3 The evidence pack
A versioned document on the ledger. It replaces the list of file names that Ghost Builder keeps today. `GhostEvidence.cs` stays as the local, folder-scoped reader. The binaries stay on the office disk.

Example item:
```json
{
  "id": "ev-0007",
  "kind": "photo",
  "sha256": "9f2c...",
  "local_path": "evidence/photos/IMG_0412.jpg",
  "provider": "wikimedia-commons",
  "source_url": "https://commons.wikimedia.org/wiki/File:...",
  "retrieved_at": "2026-10-02T09:14Z",
  "terms_url": "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
  "terms_version_date": "2026-10-02",
  "licence": "CC-BY-SA-4.0",
  "attribution_text": "Photo: <author>, CC BY-SA 4.0",
  "allowed_uses": { "view_reference": true, "geometry_extraction": true,
                    "texture_embed": false, "redistribute": false, "ml_training": false },
  "jurisdiction": "JO", "freedom_of_panorama": false,
  "faces_plates_blurred": true,
  "delete_by": null,
  "attestation_id": "att-0002",
  "admitted_by": "user:...",
  "registration": { "method": "colmap+teaser+icp", "scale": 1.0031,
                    "rmse_mm": 18, "confirmed_by": "user:..." },
  "derived": ["ev-0007/mask-window-3.png"]
}
```
`texture_embed` and `redistribute` are false by Sentinel policy, even where the licence would allow them. The pack refuses a file whose sha256 has changed.

### 6.4 The processing service: `sentinel-survey`
A local Python job next to the bridge. It is CPU-first and runs one job per pack.
1. **Ingest.** PDAL reads E57, LAS/LAZ, PLY or PTX and writes one COPC file. It removes outliers and thins the cloud to a voxel grid.
2. **Gravity-align.** Point Z up.
3. **Storeys.** A height histogram finds floor and ceiling slabs. These become the level proposals.
4. **Walls.** For each storey it cuts a slice, makes a density image, finds contours and extracts face segments. The segments go into the same structure `WallPairing` already takes. Walls snap their base and top to the detected levels.
5. **Floors and ceilings.** Slab boundaries come from the slab points.
6. **Openings (phase 3).** For each wall plane, an occupancy grid finds empty rectangles.
7. **Deviation.** For each proposed element it measures distances between cloud and element at 5, 10 and 20 cm.
8. **Photos (phase 4) and drawings (phase 3).** These are registered, then used as evidence for each element.

It outputs element proposals as JSON. Revit never sees the raw cloud.

### 6.5 Element hypotheses (the proposal contract, extended)
The fields are backward compatible, so old proposals still pass. The vocabulary grows from `wall, floor, level, grid` (see `VOCABULARY` in `WebApp/bridge/changesets-logic.mjs`) to add hosted `door` and `window`. Ceilings, columns, roofs and stairs come later.

```json
{
  "proposal_guid": "...",
  "kind": "wall",
  "place": { "LocationCurve": { "start": [0, 0, 0], "end": [8.42, 0, 0] },
             "BaseLevel": "L02", "TopLevel": "L03" },
  "measured": { "thickness_mm": 212, "height_mm": 3050 },
  "typing": { "type": "EXT-200-Brick", "source": "catalog",
              "why": "guideline@7 external masonry, nearest catalogue thickness 200 (delta 12 mm)",
              "guideline_sha": "...", "catalog_sha": "..." },
  "evidence": ["ev-0001#slice-L02", "ev-0007#crop-3", "ev-0012#seg-88"],
  "won": { "geometry": "scan", "exists": "scan", "type": "catalog", "material": "photo" },
  "confidence": { "geometry": 0.92, "type": 0.80, "basis": "scan-backed, rule-typed" },
  "deviation": { "p95_mm": 14, "share_within_5cm": 0.98, "target_mm": 20 },
  "conflicts": [],
  "pretick": true
}
```

### 6.6 Each source has a fixed role

| Source | Role | Can it create an element alone? | Default confidence |
|---|---|---|---|
| Point cloud | The geometry authority: position, thickness, height, levels | Yes | High where scan coverage is good |
| DWG/PDF from the owner | A prior, plus what the scan cannot see: closed doors, grids, type names from schedules | Yes, flagged "drawing only" and never pre-ticked | Medium |
| Registered photos (scanner panoramas, own photos) | Whether an opening exists, material, style, internal or external | No. It confirms a proposal or chooses between catalogue types. | Medium |
| Internet photos | Context only | No. Flagged "assumed". | Low |
| Open footprints (OSM, Overture, Microsoft) | Outline and height seed where the scan has no coverage | Outline only | Low |

**Conflict rules**
- Where the scan covers an area, the scan wins on geometry.
- The drawing wins on openings the scan cannot see.
- Photos break ties between catalogue types.
- Every conflict becomes a review row that shows both pieces of evidence.
- The `won` field records which source won for each attribute.

### 6.7 Typing through the office's standards
- **The rule is deterministic.** The service builds the guideline input (category, function, measured thickness, location and material if known) and calls `resolveWithCatalog`. The same resolver already runs in TS and C# with conformance tests (`guideline.test.ts`, `guideline-bds.test.ts`).
- **Snap first.** A scan measures finishes and walls that are out of plumb. Sentinel snaps to the nearest catalogue type within a project tolerance.
- **Outside the tolerance, propose instead of inventing.** `GhostTypeCreator.cs` can already make a new size of an office type by duplicating the nearest office sibling. In survey mode this becomes a Holding Area row, "new size of office type X", not an automatic action. If there is no sibling, it becomes a gap row.
- **Doors and windows.** Pick the nearest catalogue family type by width and height within tolerance. Otherwise it is a gap. Never a `[Width]x[Height]mm` type.
- **Names.** Types come from the catalogue, so they already follow naming@n. New-size proposals and levels get their names from naming@n (`SentinelAddin/Standards/NamingProposer.cs`).
- **AI fills categories only.** A vision-language model may choose from a closed list (brick, render, glass, internal or external). A schema rejects numbers.

### 6.8 Review in Revit (the existing proposal, tick and place path)
- The existing proposal review window, plus a DirectContext3D overlay (audit AI-4 and GHB-4). The overlay shows a decimated cloud and the proposal outlines coloured by confidence.
- Rows are grouped by storey and kind. Each row shows the scan slice, the photo crop and the drawing crop. "Zoom to row" is available.
- **Pre-tick policy.** A row is pre-ticked only if all three hold:
  1. Its geometry is scan-backed and within the project tolerance.
  2. It is typed by rule from the catalogue.
  3. It has no conflict.
  Every other row stays unticked.
- A person can accept a whole storey in one batch. The reason for every declined row is recorded.
- Placement uses `ChangesetExecutor` in chunks of at most 200 elements per storey (`MAX_CHANGESET_ELEMENTS = 200`). Each action is one Undo entry (XC-2, merged in 4638d25). Each element is stamped with its `proposal_guid` and watched for undo (audit AI-3).

### 6.9 IDS/contract check and ledger receipt
- The bridge's `proposeChangeset` checks every proposal against the project IDS/contract before anything reaches the model. This already exists.
- **New contract field:** the target tolerance for as-built elements.
- **New Federation Gate rule:** an as-built element fails if its deviation is outside the contracted tolerance or it has no catalogue type.
- **Ledger rows:** `evidence.admitted`, attestation, changeset proposed, adjudicated, accepted, declined, applied and reverted. Each row carries the evidence sha256 values and the standard versions (`guideline_sha`, `catalog_sha`).
- **Deviation re-check after edits.** It runs in the service against the COPC. `GetPoints` is used only as an optional spot check inside Revit when an RCP is linked.

### 6.10 What we reuse and what is new

| Piece | Today | Change |
|---|---|---|
| `WallPairing.cs`, `GhostWallPairer.cs` | Pairs DWG face lines into walls with a thickness | Also accept scan-slice segments |
| `GuidelineMatcher.cs`, `resolveWithCatalog` | Resolves a type from guideline + catalogue | Add opening size matching. Snap tolerance per project. |
| `GhostTypeCreator.cs`, provisioners | Creates a new size of an office type | In survey mode, propose instead of creating |
| `DatumFromDrawing.cs`, `DatumBuilder.cs` | Levels and grids from drawings | Also levels from scan storeys |
| `LayerMapper.cs`, `LayerRulesetMatcher.cs` | Maps DWG layers to categories | Reuse for drawings in phase 3 |
| `GhostEvidence.cs` | Reads PDF/txt/md/csv from a scoped local folder into a text blob | Keep as the local reader. The pack replaces its file-name list. |
| `LocalVisionReader.cs` | Local vision hints from images, never geometry | Reuse for photo attributes |
| `ChangesetExecutor.cs` + `changesets-logic.mjs` | Vocabulary wall, floor, level, grid. 200 elements max. | Add hosted door and window (GHB-1). Chunk per storey. |
| Holding Area, review chain, IDS/contract, Federation Gate, ledger | Live | New rule and new row kinds |
| **New** | | Evidence pack, `sentinel-survey` service, overlay, attestations, source tiers |

### 6.11 Why this beats every tool in section 2, and where it does not

| What matters | Best tool today | Sentinel |
|---|---|---|
| Detection quality | Aurivus AI, EdgeWise Pro | Modest: geometry-first, CPU. Sentinel can import their output (phase 6). |
| Sources | One or two | Four, with a per-element record of which source won |
| Types | The vendor's own, generic, or as-measured | Office catalogue + guideline@n + naming@n. Gaps, never inventions. |
| Accuracy on each element | Undet tolerance parameter | Deviation at 5/10/20 cm, the contract tolerance, and evidence ids |
| Standards check before placement | None | IDS/contract check |
| Audit | None | Hash-chained ledger receipt: who accepted what, on which evidence, under which standard version |
| Legal side of internet sources | None | Licence record, attestations, source tiers |
| Vendor risk | Locked to one engine | A proposal format that works with any extractor |

**Where Sentinel will not win:** raw detection on messy scans, MEP extraction, and mesh visualisation. Do not compete there. Import and govern those results instead.

**"Any other asset."** Version 1 covers buildings with planar elements. For industrial assets and MEP, buy EdgeWise and re-type its output through phase 6. Infrastructure such as roads and bridges falls outside the element set Sentinel creates today.

---

## 7. Phased plan

Sizes are rough estimates of focused build time: S is days, M is 1 to 2 weeks, L is 3 to 4 weeks, XL is 5 weeks or more.

| Phase | Delivers | Size | Live proof |
|---|---|---|---|
| **P1. Foundations: prerequisites + evidence pack v0** | Audit items GHB-1 (hosted openings), GHB-2 (wall base and top from levels), AI-3 (proposal_guid + undo watcher), AI-4/GHB-4 (DirectContext3D preview) and XC-5 (ledger rows for Ghost). Evidence pack v0: manifest, sha256, licence, attestation, binaries local, `evidence.admitted` rows. Proposal contract v2 fields (optional). | L | A DWG Ghost run on aster-tower: 10 door blocks give 10 hosted doors within 1 degree. Walls get base and top levels from the datum. Ctrl+Z records "reverted by undo". A pack of 3 files shows 3 ledger rows, and editing one file makes the pack refuse it. |
| **P2. Scan to levels, walls and floors (first useful slice)** | `sentinel-survey` (PDAL, pye57/laspy, Open3D, OpenCV). E57/LAS/LAZ/PLY/PTX to COPC, storeys, slices, face segments, `WallPairing`, `resolveWithCatalog`, changesets per storey. Deviation per element. Overlay in Revit. Typing gaps go to the Holding Area. No automatic types. | L | One real scan the office owns, used with permission. One public scan (Cloud2BIM Kladno, after checking the Zenodo licence). Report wall F1 at 5, 10 and 20 cm against a hand-built model, and level error. Every wall has a catalogue type or is a gap. Zero types created. Ledger shows evidence hashes per wall. Record the run time on the founder PC. |
| **P3. Openings and drawings** | Openings from wall-plane occupancy, placed as hosted doors and windows from the catalogue by size. DWG (existing import) and vector PDF (PdfPig) aligned with a two-point human check. Drawings add closed doors, grids and type hints. Conflicts become review rows. Differences between drawing and scan become BCF issues. | L | A scan with at least one door closed during scanning: the drawing proposes it, flagged "drawing only", and a person accepts it. Opening count compared with a hand count. Registration RMSE shown and confirmed. A planted drawing-vs-scan difference creates one BCF issue. |
| **P4. Photos** | Scanner panoramas from E57 first. Then own photos via COLMAP, TEASER++ and ICP (or `map-anything-apache`). Faces and plates blurred on ingest. Grounding DINO + SAM 2 confirm openings. Qwen3-VL fills closed-list attributes. Never dimensions. | L | 20 own photos registered, with RMSE confirmed by a person. A wall that thickness alone left ambiguous is typed from its photographed material and accepted. A model attempt to set a dimension is rejected by the schema. Stored copies are blurred. |
| **P5. Internet evidence (after counsel review)** | GREEN sources fetched automatically: OSM/Overture/Microsoft footprints, Copernicus, Mapillary (after one-time acceptance), KartaView, Panoramax. AMBER sources admitted by a person: Commons, Flickr CC-commercial, Openverse, web leads via Claude web search with allowed domains. RED sources blocked. Owner attestation before any search. Terms snapshots, `delete_by` job, NOTICE file per model, TDM opt-out check. No web search for drawings. | M | For a test asset: the footprint seeds the outline and is compared with the scan. 5 Commons photos admitted with licence fields. A Street View screenshot refused at intake. A web lead stays a lead until a person resolves its licence. The NOTICE file lists every credit. |
| **P6. Adapters, more element kinds, gate and web** | Governed re-typer for third-party output: IFC from ScanToBIM-CAD, Pointorama, ODA and Cloud2BIM; RVT from Aurivus, EdgeWise and Matterport, re-typed in place. Ceilings and columns. Stairs and roofs as flagged manual rows with a scan slice. Federation Gate tolerance rule. Optional learned segmentation, only with licensable weights. COPC viewer in the That Open web app. | XL | A USD 29 ScanToBIM-CAD IFC of the P2 scan is re-typed with no generic types left and compared with Sentinel's own P2 result. The Federation Gate fails an element placed 60 mm off and passes it after correction. |

**If you want a visible result sooner,** move the P6 re-typer for third-party IFC to straight after P1. It is the cheapest proof that governance is the product. It needs only a USD 29 scan conversion.

---

## 8. Decisions the founder must make

1. **Build or buy detection.** Recommendation: build the CPU, geometry-first pipeline for planar buildings (levels, walls, floors, openings). Buy or partner for MEP (EdgeWise) and optionally for AI detection (Aurivus), and govern their output. Do not build learned segmentation unless licence-clean weights exist.
2. **Compute budget.** Default: the bridge PC's CPU, at zero cost. Optional: the local RTX 4060. Cloud GPU (for example RunPod RTX 4090 at USD 0.74/hour) only when a client opts in to data leaving the office.
3. **Internet sources.** Approve the GREEN, AMBER and RED lists in section 4. Get counsel review before P5, especially for Jordan (no freedom of panorama, and plans are protected). Decide whether Claude web search is enabled, on which allowed domains, and with what monthly cap.
4. **Model and library licence policy.** Proposed allow-list: MIT, BSD, Apache-2.0, BSL-1.0, and LGPL as a separate process. Ban AGPL and GPL in shipped code, and ban non-commercial weights. Decide whether to read and accept the VGGT-1B-Commercial licence or use only `map-anything-apache`.
5. **Accuracy promise and tolerances.** Default wording: LOD 200, never survey or permit grade. Take the target tolerance from each project's contract. Pick the default pre-tick tolerance (for example 20 mm) and the type-snap tolerance.
6. **ReCap dependency.** Sentinel's own intake reads E57/LAS/LAZ/PLY/PTX without ReCap. In Revit, show the scan with the DirectContext3D overlay by default, and link an RCP only when the user already has ReCap. No custom point cloud engine.
7. **Evidence storage.** Binaries stay on the office disk or NAS. Only manifests and hashes go to Supabase. Name the storage location per office.
8. **Proof data.** Supply one real scan of a real building with the owner's permission (E57 with panoramas if possible), plus its drawings and some photos. Approve the check of the public Kladno scan's licence as a second test set.
