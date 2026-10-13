# MA-7 plan: photos + web evidence (after counsel)

Source: `docs/strategy/2026-09-30-model-automation-design.md` §7 MA-7 (:1222-1237), §4.2 photos (:408-435), §4.4 web evidence (:481-503), §6.2 evidence pack (:636-674), §6.6 ledger rows (:826-866), §6.7-§6.11 (:867-978), That Open `SplatLoader` row (:572), packaging-spike line (:938), decisions D4-D8, D14 (:1371-1381), risks "Legal risk of web evidence", "Licence leakage", "Installing the Python service on Windows" (:1406-1408). Research: R2M §3.1, §3.8, §4.1-§4.6, §5.2-§5.4, §6.3, §6.6; TO §5.2, §6.
Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`, master b43816d, web 1.0.86, survey 0.6.0. Paths are relative to `WebApp/` when they start `bridge/` or `src/`; otherwise relative to the repo root.
Claims were checked in the code on 2026-10-13 (file:line given). Claims marked "(map)" come from `scratchpad/ma7/map-*.md` and were not re-opened.
Founder's instruction: **"go ahead with MA-7"**. **Counsel has not reviewed web evidence.** So this plan runs on the design's recommended defaults: web search off, no search for drawings, the RED list enforced. Everything that depends on counsel sits behind the founder's switch (default off) and is owed (§7). Every download waits for the founder's explicit OK, one item at a time, with its name, source and size (§6). Revit rows cannot run today (§8).

---

## Synthesis notes

Three drafts were judged: SHIP (`draft-ship.md`), RISK (`draft-risk.md`) and TRUST (`draft-trust.md`). Each is scored 1-5 on five criteria.

| Criterion | SHIP | RISK | TRUST |
|---|---|---|---|
| Coverage (every deliverable, every Drill MA7 row) | **5** | **5** | 4 |
| Correctness against the code | **5** | 3 | 4 |
| Safety (RED, attestation, licences, blur, no dimension from vision, photos never create alone) | 3 | 4 | **5** |
| Ordering (download-free and counsel-free first; spikes before what they could invalidate) | **5** | 3 | 4 |
| Slice size realism | **4** | 3 | **4** |
| **Total** | **22** | 18 | 21 |

**Reasons**
- **SHIP.**
  - Strongest spine. It has 22 traceable slices, a full deliverable → slice map and a drill-row → plan-row map.
  - Its line cites were verified: `bridgeImage` at `src/setups/bridge-fetch.ts:142`, `saveAs` at `src/setups/audit-pack.ts:28`, the stream at `bridge/bcf-service.mjs:1242`, `filed` cids at `bridge/survey-plan.mjs:263`, and that `packOf`/`fold`/`row` are not exported today.
  - It puts the splat viewer before any download (a synthetic PLY), and Commons right after the download-free work.
  - Its batch-1 build maps are the most implementable.
  - Weak on safety:
    - its sweep deletes an *own* file when the sha matches (an office's original);
    - freedom of panorama is shown but never refuses;
    - the switch has no counsel reference;
    - a blur can be undone (Gaussian + pixelate);
    - there is no structural guard that photos never create elements or that imagery never reaches the model.
- **RISK.**
  - Best at the spikes it found: the material-reader spike, a held-out check point for registration, the Brush fallback, PyPI index queries before any download, and RED matching by whole host label.
  - Correctness slips:
    - lazrs is MIT, not Apache-2.0 (`lazrs-0.8.2.dist-info`: `License-Expression: MIT`);
    - its closed material list holds `concrete` and `concrete-block`, but the typer matches `when.params` values **by substring** (`src/sentinel-core/guideline.ts:214-219`), so "concrete-block" would hit a Concrete rule;
    - the founder makes a real Street View screenshot (a RED capture on disk).
  - Its per-project owner switch is weaker than an env switch only the founder holds.
  - Batch 1 builds the counsel-held web items before the own-photo work, and batch 0 holds seven spikes, downloads included.
- **TRUST.**
  - Best safety. It adds:
    - an item-field whitelist;
    - an imagery refusal in `validateChangeset`;
    - a `source:"photo"` create guard;
    - a model-licence gate (the weights table refuses `llama3.2-vision`);
    - a switch that turns on only with counsel's review sha;
    - an EXIF camera check, so an unnamed screenshot is refused;
    - own originals never deleted;
    - an irreversible mean-colour fill;
    - and it found a real gap: the Seagram Commons photos (`demo/aster/README.md:31`, three CC BY-SA) reach Photo Massing outside every gate.
  - Coverage is thinner: it drops `capture_rules` and the cloud-GPU path outright, and the splat viewer waits behind the GPU downloads.
  - Its batch 2 merges a bridge refusal that breaks the founder's Photo Massing before the add-in can deploy (its own R19).

**How the final plan is built**
- **Spine:** SHIP's slice order, batch shape, words and build-map detail.
- **Grafted from TRUST:**
  - the licence gate's weights table and `modelRefusal`;
  - the env switch with a counsel reference;
  - the item whitelist, the imagery refusal and the photo-create guard;
  - the EXIF camera check;
  - "never delete an office's own file";
  - the mean-colour fill;
  - "Photo Massing reads the pack" (moved to the Revit batch so it merges with its add-in deploy);
  - the counsel questions;
  - share-alike held for counsel.
- **Grafted from RISK:**
  - the M-0 material spike;
  - registration with ≥ 4 control points and one held-out check point;
  - index queries as download #0;
  - FoP "no" or "unknown" refuses;
  - whole-label RED host matching;
  - the (g) wording that claims viewing only;
  - the Brush fallback;
  - web originals replaced by their blurred copy;
  - `capture_rules` kept as a held slice, so nothing is cut.

**Corrections found in synthesis (BINDING on the build)**
1. `tools/massing-check` compiles only `SentinelAddin/GhostBuilder/MassingPlanner.cs` (`tools/massing-check/massing-check.csproj:10`, net8.0, no WPF). `ParseView` lives in `MassingVisionReader.cs:115` and is pure (System.Text.Json only). So the add-in twin of drill row 3 **moves `ParseView` (and the schema string) into `MassingPlanner.cs`**, or MV-1 cannot run. All three drafts missed this.
2. Material values reach the typer as `params.Material` and match `when.params` **by substring** (`guideline.ts:214-219`). A material list must hold no value that contains another. The bridge refuses such a list in words (7-9).
3. Thickness is not a `when` condition. It fills `use.typePattern` `{thickness}`. "Ambiguous by thickness alone" therefore means the guideline's Walls rules are keyed on `params.Material` with **no** rule without Material, so a wall with no Material matches no rule and becomes a type gap (`changesets-typing.mjs:84`, "no rule … matches"). The drill guideline is written that way.
4. Adding an import to `bridge/evidence-store.mjs` breaks test (h)'s allow-list (`bridge/evidence-store.test.mjs:198`). Pure tables (`web-sources.mjs`, `licence-logic.mjs`) are added to the list, a pin that moves on purpose. Byte-serving code lives in a new `photo-store.mjs` (SHIP R5).
5. `imageryRefusal` must not read an element's `reason`, `evidence` or `validate`: a reason may name `photos/x.jpg`.

---

## 0. Already built (no slice, no re-plan)

| Item | Proof |
|---|---|
| Evidence pack, one per project, immutable `evidence_pack@n`, folded by the bridge only | `bridge/evidence-logic.mjs:159-163` `newPack`, `:262-342` `validatePack`; `bridge/evidence-store.mjs:117-118` `fold` (expectVersion) |
| Attestations (a)-(f), texts pinned by sha256; a photo needs (a), (c), (d) | `evidence-logic.mjs:12-20`, `:23` `ADMIT_NEEDS`; web copy `src/setups/evidence.ts:10-19` |
| **RED rule at intake, naming (d).** A provider containing google/apple/bing/azure is refused with "… is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)", plus an `evidence:refused` row and a hold | `evidence-logic.mjs:33`, `:128`; `evidence-store.mjs:246-249`; `bridge/holding-logic.mjs:73-80` (map) |
| A non-own photo or scan is refused: "web and third-party items wait for a later stage …". This is the hook MA-7 replaces | `evidence-logic.mjs:131` |
| `allowed_uses` is exactly 5 booleans; `texture_embed` and `redistribute` are always false | `evidence-logic.mjs:69`, `:331-333` |
| Ledger rows `evidence:admitted/refused/requested` and `attestation:signed`. The `evidence:` prefix and `evidence` type are reserved | design :833-835; `bridge/cde-store.mjs:1214-1215` |
| Dataset licence record (CC-BY-4.0 / CC0-1.0, https `source_url`, attribution, (f)); SA/NC/ND refused | `evidence-logic.mjs:26-29`, `:167-184` |
| "Ask the owner" letters. No search code for drawings exists | `evidence-logic.mjs:187-231`; design :489 |
| `build:run` rows list `tools [{name, version, licence}]` and have `model_calls`/`tokens` fields; `claimed:false` means bridge-run | `bridge/build-jobs.mjs:199-221` (`buildRunValue`); `survey/service.py:45-64` (`tools()`, `INSIDE`) |
| Pinned private wheel folder + offline `--require-hashes` install | `survey/las.py:28-71` (map); `survey/requirements-ma4g.txt` (map) |
| Photo Massing v2 schema: counts, a ratio and a view enum. `ParseView` reads five keys and **ignores** any other (no refusal); `additionalProperties` is not set | `SentinelAddin/GhostBuilder/MassingVisionReader.cs:33-43`, `:115-139` |
| An agent never files as the add-in: `source:"photo"` from MCP becomes `agent` | `bridge/changesets-logic.mjs:70` `ADDIN_SOURCES`; `bridge/mcp-server.mjs:342` |
| The typer types a wall from guideline rules over facts (`params` included) and throws a typed gap | `bridge/changesets-typing.mjs:69-104`; survey walls' facts `{thickness_mm, params:{Location}}` at `bridge/survey-plan.mjs:311` |
| Spark 0.1.10 (MIT) renders PLY/SPZ through `SplatMesh({fileBytes})`; the reality-capture controller has a TransformControls gizmo | `src/setups/reality-capture/lib/splat-tile-plugin.ts:2,31`; `reality-capture-viewer.ts:162-232` (map) |
| Authenticated image fetch to an object URL; bridge image stream precedent | `src/setups/bridge-fetch.ts:142` `bridgeImage`; `bridge/bcf-service.mjs:897-899`, `:1242` (pipeline) |
| Sandboxed download (`saveAs`) | `src/setups/audit-pack.ts:28` |
| Cloud is off unless `SENTINEL_AI_CLOUD=1`; "a key sitting in .env is not consent" | `bridge/ai-gateway.mjs:6,82,122` |

**On this PC, no download needed (local reads, 2026-10-13)**
- In the user site `%APPDATA%\Python\Python314\site-packages`, beside numpy 2.4.6, which the survey already uses (`bridge/survey-service.mjs:37`, map):
  - **Pillow 12.3.0**, licence MIT-CMU (from its dist-info);
  - **onnxruntime 1.26.0**, "MIT License";
  - pillow_heif 1.7.0, which bundles LGPL libheif/libde265 and is **never imported in process** (§6.10).
- Ollama (`ollama show --license`, map + drafts):
  - `qwen3.6:latest` 3899b1c0e7c5: Apache-2.0, vision, 23 GB;
  - `llava:latest` 8dd30f6b0cb1: Apache-2.0, vision, 4.7 GB;
  - `llama3.2-vision:latest` 6f2f9757ae97: Llama 3.2 Community licence, **not on the allow-list**, and HTTP 500 on every P-1 photo.
- Hardware and tools:
  - RTX 4060 Laptop, 8 GB;
  - no conda, nvcc, cmake or colmap on PATH;
  - MSVC 14.44 Build Tools present;
  - .NET `Microsoft.WindowsDesktop.App.Ref` present (WPF builds offline);
  - C: has 182 GB free.
- Wheel licences, read from their dist-info:
  - laspy 2.7.0 BSD-2-Clause;
  - **lazrs 0.8.2 MIT** (carries laz 0.12.2 Apache-2.0, `survey/service.py:41`);
  - pye57 0.4.19 MIT (carries libE57Format BSL-1.0 and Xerces-C++ Apache-2.0);
  - pyquaternion 0.9.9 MIT;
  - numpy 2.4.6 `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`.
- npm lockfile licences (213 entries):
  - MIT 176, BSD-3-Clause 13, Apache-2.0 5, ISC 5, BSD-2-Clause 5, `(MIT AND Zlib)` 2, 0BSD 1, MPL-2.0 1;
  - outside §6.10, to be decided:
    - `@markerjs/markerjs3` "SEE LICENSE IN LICENSE" (Linkware);
    - `fast-sha256` Unlicense;
    - `jszip` `(MIT OR GPL-3.0-or-later)`, which passes as MIT;
    - `duck` "BSD";
    - `xmlhttprequest-ssl`, which has no field.
- NuGet: PdfPig 0.1.16 / 0.1.* (Apache-2.0), System.Security.Cryptography.ProtectedData 8.0.* (MIT), System.Text.Json 8.0.* (MIT), Nice3point.Revit.Api.RevitAPI / RevitAPIUI (compile-time reference assemblies of Autodesk's API, not shipped).

**Not built, and what that means**
- No photo reader:
  - `pickItems` lists scans, drawings and models only (`build-jobs.mjs:128-131`);
  - sentinel-survey refuses photos (`survey/service.py:80-81`, map);
  - so an admitted photo is stored and listed, nothing more.
- No blur, stored copy, EXIF record, `delete_by`, `evidence:expired` (design :833, "waits for MA-7"), NOTICE, per-item licence fields, web fetcher, robots/TDM check, terms snapshot, splat kind, placement row, `tools/licence-check` (design :951 TARGET), item-field whitelist (only pack fields are whitelisted, `evidence-logic.mjs:264-265`), or model-licence gate.
- The web admits a photo with **one click and no form** (`src/setups/files-panel.ts:408-412`), so a person cannot say where it came from.
- Photo Massing reads a free folder (`GhostSourceFolder`), outside the pack. The Seagram Commons photos fed MA-6 P-1 that way (`demo/aster/README.md:31`; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:3071`, map).

---

## 1. Slices, in order

| id | Slice | Size | Live drill rows | Why here | Needs | Design |
|---|---|---|---|---|---|---|
| 7-1 | **Licence gate.** Pure `bridge/licence-logic.mjs` (SPDX verdicts, banned names, a **weights table** with `modelRefusal`) plus the CLI `tools/licence-check/check.mjs` over npm, Python pins, NuGet and weights. CI fails on banned or unknown; known pending items warn until the founder decides | S/M | LC-1, LC-2, LC-3 | Every later slice adds downloads; the gate exists before the first | nothing | §6.10 :949-951; risk :1407 |
| 7-2 | **Counsel switch + source lists.** Pure `bridge/web-sources.mjs`: the GREEN/AMBER/RED table (hosts, licences, keep days, `held_for_counsel`), whole-label host matching, and `webSwitch(env)` (`SENTINEL_WEB_EVIDENCE` = `off`/`drill`/`on`; `on` needs `SENTINEL_WEB_COUNSEL_REF`). `GET …/evidence/:pack/web` shows the state | S | O-1 | "Off until counsel" as one function; every web path reads it | nothing | §4.4 :485-489; D5 :1372; "you approve the source lists" :1223 |
| 7-3 | **Guards.** An item-field whitelist in `validatePack` (with a replay test); `imageryRefusal` in `validateChangeset` (imagery never into RVT/IFC); `photoKindRefusal` (a `source:"photo"` changeset creates only `mass`/`level`) | S | G-1, G-2, G-3 | Structural guarantees every photo slice relies on; a few lines each | nothing | :425; :490-496 ("never embedded"); §6.2 :670-674 |
| 7-4 | **Photo intake: where it came from + camera data.** The one-click photo Admit becomes a 3-choice form (own camera / a map service / a website). A map service is refused by the RED rule (`street view` joins it); a website gets "waits for counsel"; a **new own photo must carry camera EXIF** (Make/Model), else it is refused as a probable screenshot. `capture {make, model, taken_at, gps:bool}` goes on the item and the row; coordinates never do | S/M | SV-1 … SV-4 | Drill row 5. Without it, (d) is a sentence only | nothing | drill :1229-1237 row 5; (d) R2M 4.6 |
| 7-5 | **`delete_by`, expiry, retire.** A lead sets a delete-by date (today = retire now). A sweep runs at start, every 6 h and after a set: the item becomes `expired` (record + sha kept, never read again); one `evidence:expired` row. Sentinel deletes only **its own copies** and a web item's file (sha-checked), **never an office's own file** | S/M | X-1 … X-4 | Design "a `delete_by` job", `evidence:expired`; closes "retiring a flagged item waits for MA-7" (`evidence-logic.mjs:250-251`) | nothing | :492; :833; R2M 4.5 |
| 7-6 | **NOTICE.** `GET …/evidence/:pack/notice` gives deterministic text + sha256: every credit (dataset, drawings, vendor models, later web photos), the own-item count, and every tool and weight from this project's `build:run` rows. Web: "NOTICE" saves `<key>-NOTICE.txt` | S | N-1, N-2 | Drill row 7; every later source adds its lines | nothing | :493 "a NOTICE file per model" |
| 7-7 | **Stored copies, blurred.** `survey/blur.py` ("sentinel-blur 0.1.0", installed Pillow 12.3.0, version-pinned) writes `.sentinel/view/<ev-id>.jpg`: each person-marked box **filled with its mean colour** (irreversible), long side ≤ 2048, no EXIF/XMP/ICC/thumbnail. The bridge hashes the copy itself and writes `evidence:blurred`. From then on every view, read and job uses the copy only | M | B-1 … B-5 | Drill row 4; the precondition for 7-8 … 7-12 | Pillow's licence (founder OK, not a download) | :424 "blurred on ingest"; R2M 3.8 |
| 7-8 | **Closed-list vision reader + add-in twin.** Step 0 is spike M-0 (installed qwen3.6/llava on 12 labelled own wall photos). Then reader `photo-reader 0.1.0` in the job runner: Ollama on loopback only, `modelRefusal` first, the blurred copy only, schema `{material: enum[choices + "cannot tell"]}` with `additionalProperties:false`, and a strict parse: **any other key refuses the whole answer, and a dimension key is named**. Its `build:run` carries model, digest, licence, calls and tokens, and no candidates. Add-in: `ParseView` moves into `MassingPlanner.cs` and an extra key becomes a row error | M | M-0, VR-1 … VR-4, MV-1, MV-R (Revit) | Drill row 3; "closed-list attributes" | nothing (qwen3.6 installed) | :422-423; R2M 3.8 |
| 7-9 | **A photo chooses the type (material).** The propose body takes `materials {cid: {item, material}}`. The material must be one value of the guideline's Walls rules' `when.params.Material` (no value inside another). The wall's facts gain `params.Material`; the typer picks the rule; `typing.material_from {item, copy_sha256, read_by:"person", reading_job?}`. Never pre-ticked; no size from a photo | M | PT-1 … PT-3, PT-R (Revit) | Drill row 2; "photos … choose between catalogue types" | nothing | :425 |
| 7-10 | **A photo confirms a ghost.** A desk accept may cite photo items. The decision carries `evidence:[ev-id]` and the copy's sha; the row and desk line say "confirmed by photo ev-… (person-linked, not registered)". There is no create path from a photo | S | PC-1, PC-2 | "They confirm a ghost" | nothing | :425 |
| 7-11 | **Splats in the web desk + placement on the ledger.** Step 0 is spike SP-0 (Spark in the published opaque-origin iframe, synthetic PLY). New evidence kind `splat`: format `ply` (3DGS header check), cap 256 MB, needs (a)(c)(d). `GET …/items/:id/view` streams it to a member; "Show in 3D" uses Spark `SplatMesh` in the shared world with a gizmo; "Save placement" writes `splat:placed` with the 4×4 matrix (new reserved prefix/type). Words: "for looking only — dimensions come from scans" | M | SP-0 … SP-5 | Deliverable 4 with no download (a synthetic PLY); a real splat comes from 7-19 | nothing | :1228; :426-432; :572; TO 5.2 |
| 7-12 | **Wikimedia Commons admission, behind the switch.** With `drill` or `on`, a lead admits a Commons photo: SPDX licence (CC0/PDM/CC-BY; **SA held**), `web {source_url (commons/upload hosts), author, attribution_text, retrieved_at, terms_path + terms_sha256, freedom_of_panorama, delete_by, web_mode}`, `role:"context"`, `geometry_extraction:false`, attestations (a)(d)(g). It is blurred in the same step and **its file replaced by the copy** (`original_sha256` kept). FoP "no"/unknown refuses. Switch off: "waits for counsel's review" | M | CM-1 … CM-6 | Drill row 6 (+ N for row 7). Sentinel fetches nothing; a person saves the file and its page | **counsel switch**; drill data = founder's download OK | :487; :490-496; §6.2 :661-665 |
| 7-13 | **Web items are context only.** A `role:"context"` item cannot choose a type (7-9), is refused by `pickItems`, and is cited on a ghost only as "context (assumed, web)" | S | CX-1, CX-2 | "Context only, flagged assumed" | switch (testable on `drill`) | :498; R2M 6.6 |
| 7-14 | **Photo Massing reads the pack.** The add-in lists the pack's admitted, blurred photos (bridge GET) and reads their copies (bridge image route), not a free folder; the receipt names each item id and copy sha. The bridge refuses a `source:"photo"` changeset whose photos are not admitted, blurred items. **The bridge half merges only together with the add-in deploy** | M | PM-1, PM-2, PM-3 (Revit) | Closes the Seagram path (§0), so no photo gate can be walked around | Revit (deploy) | :425; :490; R2M 4.4 |
| 7-15 | **Packaging spike (Stage A, never merged).** Download #0 (index metadata) first, then each §6 item after its own OK, into its own folder (`%APPDATA%\Sentinel\photo-lib`, `--require-hashes`). It records minutes, MB, Python fit (3.14 or a private 3.12), GPU use, licence files read inside each wheel, and GO/NO-GO. PDAL/COPC: K-0 reads COPC with installed laspy+lazrs first; PDAL is recorded, not installed, unless a slice needs it | S (spike) | K-0 … K-6 | Deliverable 1; "the install time is a drill row" (:1408) | downloads | :1225; :938; :1408 |
| 7-16 | **Face detector proposes boxes.** YuNet ONNX on the **installed onnxruntime** with numpy pre/post (no OpenCV) inside `survey/blur.py`. A person still confirms and adds plates (no permissive plate model); `method:"detector+person"` | S/M | FD-1, FD-2 | Raises blur recall; never replaces the person | YuNet (0.23 MB) | :424 |
| 7-17 | **Registration of own photos; a person confirms the RMSE.** Stage A is spike RG-0. Stage B: new service `photo/service.py` "sentinel-photo 0.1.0" (survey contract: loopback, token, re-hash, no network, job folder only, receipt with licences). It runs pycolmap SfM on the blurred copies; the person picks ≥ 4 photo↔scan control points + 1 held-out check point; numpy Umeyama gives the similarity; RMSE + check distance are shown. Confirm writes `evidence:registered` | L | RG-0 … RG-3 | Drill row 1 | pycolmap (+ Python 3.12 if needed) | :420-421; R2M 3.1 |
| 7-18 | **E57 panoramas as posed photos.** `photo/` reads an E57's `images2D` blobs and their poses (struct over the XML, as `survey/e57.py` does; survey 0.6.0 untouched). Each image is admitted as a photo with `registration {method:"E57 scanner pose"}` after its blurred copy | M (data-gated) | E5-1, E5-2 | "Posed photos, starting with E57 panoramas" | an E57 with images (data) | :419-421; D8 :1375 |
| 7-19 | **gsplat splat job.** Stage A is spike T-0. Stage B: Sentinel's own short trainer on `gsplat.rasterization` trains on **blurred, registered copies only** (RTX 4060; no cloud), SH degree 0, and writes a PLY admitted as `splat` with `made_with` stamped by the bridge. Its `build:run` lists gsplat, torch and every library with its licence | L | T-0, GS-1 … GS-3 | Drill row 8; deliverable 2 | PyTorch + gsplat | :426-432; D4 :1371 |
| 7-20 | **Openings confirmed by Grounding DINO + SAM 2.** Each ghost opening is projected into the registered photos that see it: "seen in ev-… (detector, advice)" or "not seen". It never creates | L | OD-1, OD-2, OD-R (Revit) | §4.2 long term; heaviest download, last | weights + transformers | :422 |
| 7-21 | **Fetch seam (after counsel).** `bridge/web-fetch.mjs` is the only module that fetches evidence: `webRefusal` → RED host → robots.txt + TDM reservation → terms snapshot (sha + file) → licence on the source's list; images go to memory, are blurred, then stored; `evidence:fetched` | M | W-1, W-2 | §4.4 robots/TDM + terms snapshot | counsel | :490-496 |
| 7-22 | **GREEN footprints seed the outline (after counsel).** OSM/Overture/Microsoft become an outline item `role:"context"`, assumed, `delete_by` required, offered where the scan has no coverage | M | W-3, W-4 | GREEN + "footprints seed the outline" | counsel | :486; :498 |
| 7-23 | **GREEN street-level leads (after counsel).** Mapillary (a person accepts its commercial terms once: attestation (h); CC BY-NC-SA sets excluded), KartaView, Panoramax, as leads into 7-12's per-photo admission | M | W-5 | GREEN | counsel | :486 |
| 7-24 | **AMBER discovery (after counsel).** Commons API, Flickr (commercial CC; SmugMug notice; 24 h removal through `delete_by`), Openverse (discovery only) | M | W-6 | AMBER | counsel | :487 |
| 7-25 | **Claude web search (after counsel + D5).** A second switch with allowed domains and a monthly cap (USD 10 / 1,000); (a) signed first; drawing queries refused ("ask the owner"); leads only (URL + title) | S/M | W-7, W-8 | AMBER "web leads" | counsel, D5, cost | :487; :489; :503 |
| 7-26 | **`capture_rules` artefact (held, the founder's word).** Office-scope kind: photos per wall, overlap, max px, blur required, approved providers, delete-by days | S/M | Q-1 | Listed in §6.7 (:873); not an MA-7 deliverable; kept so nothing is cut | founder's word | :873 |
| 7-27 | **Cloud GPU for gsplat (held until a client opts in).** RunPod-style job only on a client's written opt-in | S | none | D4; no client has opted in | client opt-in | D4 :1371 |

**Design deliverables (:1225-1228) → slices**
- **Packaging spike:** 7-15 (PDAL/COPC, COLMAP, TEASER++ and the detection models each get a K row).
- **Photo path §4.2:**
  - posed E57 → 7-18;
  - own photos via COLMAP + registration → 7-17;
  - TEASER++/Open3D ICP → replaced by person control points; TEASER++ is a K row, and ICP is used only if RG-0 shows a gain;
  - `map-anything-apache` → 7-17 fallback;
  - Grounding DINO + SAM 2 → 7-20;
  - closed-list attributes → 7-8;
  - blur on ingest → 7-7 + 7-16;
  - "never create alone" → 7-3 + 7-9 + 7-10 + 7-14;
  - gsplat, the RTX 4060 and the receipt → 7-19;
  - SH loss and no true scale said → 7-11.
- **Web path §4.4:**
  - lists → 7-2;
  - RED → built + 7-4 + 7-2 hosts;
  - no drawing search → built + 7-25;
  - attestation before any search → 7-2 / 7-25;
  - licence record + terms snapshot → 7-12 (person-saved) and 7-21 (fetched);
  - `delete_by` → 7-5;
  - NOTICE → 7-6;
  - robots/TDM → 7-21;
  - never in RVT/IFC → built policy + 7-3;
  - context/assumed → 7-13;
  - footprints → 7-22;
  - GREEN → 7-22, 7-23;
  - AMBER → 7-12, 7-24, 7-25.
- **Splats in the desk with the matrix on the ledger:** 7-11 (+ 7-19 for a real splat).
- **Also covered:** §6.6 `evidence:expired` → 7-5; §6.10 `tools/licence-check` → 7-1; §6.7 `capture_rules` → 7-26 (held).

**Drill MA7 rows (:1229-1237) → plan rows**

| # | Design row | Plan rows | Batch |
|---|---|---|---|
| 1 | 20 own photos registered, a person confirms the RMSE | RG-1, RG-2, RG-3 | 5 |
| 2 | A wall ambiguous by thickness typed from its photographed material | PT-1, PT-2, PT-3 (+ PT-R Revit) | 2 |
| 3 | A vision model's attempt to set a dimension rejected by the schema | VR-2 (bridge) + MV-1 (massing-check) (+ MV-R Revit) | 2 |
| 4 | Stored copies blurred | B-1 … B-5; FD-1, FD-2 | 2; 5 |
| 5 | Street View screenshot refused at intake (attestation d) | SV-1 (named source), SV-2 (unnamed screenshot) | 1 |
| 6 | 5 Commons photos admitted with licence fields | CM-1, CM-2, CM-3 | 3 (switch `drill`, founder's word) |
| 7 | NOTICE lists every credit | N-1, N-2, CM-5, GS-3 | 1; 3; 6 |
| 8 | `build:run` receipt lists gsplat and its licence | GS-2 | 6 |

---

## 2. Batches

Each batch follows the MA-8 steps:
1. Build every slice on its own branch `feature/ma7-N-name`; a spike goes on `spike/ma7-…`, is never merged and uses scratch copies only.
2. Review, then merge `--no-ff`.
3. Deploy as stated below.
4. Run one combined live drill on project `ma4c-drill`. Never use aster-tower without the founder's go. Web rows run first on loopback + the local app, then the published rows after the founder's one Funnel ask.
5. Record "Session MA7 batch N" in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`.
6. Secret-scan `origin/master..master`, push, and watch that push's CI run once (`gh run watch <id> --exit-status`).

Standing rules:
- **No migration** in any batch: all state is in the pack, the artefact store and ledger rows (design 6.11).
- `survey/service.py` VERSION stays **0.6.0**. Photo tools have their own versions (D-7-21).
- Python tests: `C:\Python314\python.exe -B -m unittest discover -s survey -v` (+ `-s photo` from batch 5).
- **Claude never sets the web switch, never signs an attestation, never signs in as anyone, never captures Google/Apple/Bing imagery (even as a test file), and never downloads without the founder's per-item OK.**
- Fixtures use `example.test` names. No photo, splat or third-party file is committed; drill files stay in the project's evidence folder or the scratchpad.

### Batch 1: trust floor + plumbing (7-1 … 7-6). No Revit, no download, no counsel.
- **Deploy:**
  - Add-in: none (the report says so).
  - `npm run build:bridge-core`: no.
  - Bridge restart: once on master (new routes, the sweep timer).
  - Web publish: **1.0.87** (photo source form, capture line, delete-by controls, web line, NOTICE button).
  - Funnel: one ask, for the published rows.
  - CI gains the licence step.
- **Founder asks before merge:** D-7-16 (the pending licence list). It **warns, it does not fail**, so the merge does not wait on it.
- **Install for the drill:** nothing.
- **Data:**
  - **the founder's own phone JPEGs**: 3 with GPS on, one with a passer-by and a car plate (kept for batch 2). Owed if none are on the PC; Claude does not take one.
  - two stand-ins made by Claude from Sentinel's own viewer (a screenshot saved as PNG and as JPEG), labelled "stand-in for a Street View screenshot" (D-7-14);
  - `scratchpad/tiny.las` for X-4.
- **Rows:** in §4 with exact words. Owed to the founder: the viewer-account half of the role rows (one signed-in human).

### Batch 2: photos at work (7-7, 7-8, 7-9, 7-10). No download, no counsel; Revit rows owed.
- **Founder OK before 7-7's merge:** D-7-2. Pillow 12.3.0's licence is MIT-CMU (installed; not a download).
- **Step 0 spikes:**
  - **M-0** (before 7-8/7-9's build): qwen3.6 and llava, each on 12 of the founder's own wall photos of known material (blurred copies), with the closed schema plus one probe prompt asking for a thickness. Record a table of right/wrong/"cannot tell", seconds, and whether `format` held. **GO** if one model is right on ≥ 9/12 and says "cannot tell" rather than wrong on the rest; else D-7-7's Qwen3-VL ask.
  - **R-typer** (a unit test before 7-9): two Walls rules keyed only on `params.Material` (Concrete, Block), both with `typePattern` `BDS_EXT_…_{thickness} mm`. No Material gives a "no rule matches" gap; Concrete gives the concrete type.
- **Deploy:**
  - Bridge restart: once.
  - Web: **1.0.88** (box marker, blurred thumbnails, "Choose by photo", "Ask the photo model", photo cite on accept).
  - Add-in: 7-8's `MassingPlanner.cs`/`MassingVisionReader.cs` change, built 2021/2024/2025/2027 with `-p:DeployToRevit=false` (0 errors each; 2021 covers net48), plus `dotnet run -c Release --project tools/massing-check`. **Deploy 2021-2027 is owed until Revit is available** (§8).
- **Install for the drill:** a lead's PUT on `ma4c-drill` only:
  - `guideline@n+1` with the R-typer rules and no other Walls rule;
  - both types in that project's `type_catalog@n`;
  - put back after.
- **Rows:**
  - **B-1.** A contributor marks 2 boxes (face, plate) on own photo ev-000C (GPS on) → 201, row `evidence:blurred ev-000C · 2 area(s) · person-marked` with `gps_removed: true`. The thumbnail shows both areas filled (screenshot).
  - **B-2.** A scratchpad script byte-scans `.sentinel/view/ev-000C.jpg`: no `Exif\0\0`, no `http://ns.adobe.com/xap`, no APP1/APP2/APP13. Its sha equals the row's `copy_sha256`.
  - **B-3.** `GET …/ev-000C/original` after the copy → 403 "ev-000C has its blurred copy — the original is not shown". `…/view` → 200 image/jpeg.
  - **B-4.** The machine credential's `POST …/view-copy` → 403 "a blurred copy needs a person — it names who marked the faces and number plates: sign in. Nothing was saved."
  - **B-5.** "No faces or number plates in this photo" on ev-000D → `· 0 area(s) · person-marked`, `none_seen: true`.
  - **VR-1.** "Ask the photo model" on the PT wall with qwen3.6 → one of `Concrete | Block | cannot tell` as advice. Its `build:run … · photo-reader 0.1.0 · done` row has `tools [{name:"qwen3.6:latest", version:"3899b1c0e7c5", licence:"Apache-2.0"}]`, `model_calls: 1`, tokens, seconds and the copy's sha. Nothing is filed.
  - **VR-2 (drill row 3).** On a 4101 test bridge (the SEC-8 precedent), `OLLAMA_URL` points at a scratchpad stub on 127.0.0.1 that answers `{"material":"Concrete","thickness_mm":200}` (labelled a planted answer in the record). The job is refused: "the photo model answered thickness_mm, which it was not asked — a photo never sets a dimension (the schema allows material only); this answer was not used". The row is `… · refused` with `answers_refused: 1`.
  - **VR-3.** A job naming `llama3.2-vision:latest` → 409 "llama3.2-vision:latest is licensed Llama-3.2-Community — not on Sentinel's allow-list (design §6.10); nothing was read".
  - **VR-4.** `OLLAMA_URL=http://192.168.1.5:11434` on 4101 → 409 "evidence photos are read by a model on this PC only (127.0.0.1) — nothing was sent".
  - **MV-1.** `tools/massing-check` with a planted view reply `{"storeys":38,"full_height":true,"height_to_width":3.2,"view":"front","height_m":157}` prints a PASS line containing "the model offered height_m - counts and ratios only (the schema); this photo was not read".
  - **PT-1.** A survey job on a scratch scan with a 200 mm wall → the wall is a **type gap** ("no rule … matches a wall with …"), On hold.
  - **PT-2 (drill row 2, desk).** The lead opens "Choose by photo" on that gap, picks ev-000C's blurred copy and chooses `Concrete` → the re-proposal files the wall typed `BDS_EXT_STR_CONC_200 mm`, not pre-ticked. Its reason ends "· material Concrete from photo ev-000C, chosen by <lead>"; `typing.material_from.read_by` = "person".
  - **PT-3.** `Steel` (no rule names it) → 400 listing "Concrete or Block". `thickness_mm` inside `materials` → 400 "a photo sets the material only — nothing was saved". A photo with no blurred copy → 409.
  - **PC-1.** A desk accept citing ev-000C → `changeset_reviewed` with `evidence:["ev-000C"]`; the line reads "confirmed by photo ev-000C (person-linked, not registered)".
  - **PC-2.** Citing a photo with no blurred copy → 400.
  - **PT-R, MV-R:** §8 (owed).

### Batch 3: splats in the desk + Commons behind the switch (7-11, 7-12, 7-13). No software download; Commons drill data needs the founder's OK.
- **Step 0 spike SP-0** (before 7-11's build):
  1. A synthetic 3DGS PLY (1k and 200k gaussians, written by a scratchpad numpy script, never committed) goes through `SplatMesh({fileBytes})` into the **local app** world (≥ 20 fps at 200k).
  2. The same is tried in the published app after 1.0.89.
  3. If Spark's worker/wasm fails in the opaque-origin iframe, 7-11 ships local-app only, and the words say so (D-7-25).
- **Deploy:**
  - Bridge restart: once.
  - Web: **1.0.89**.
  - Funnel: one ask.
  - `splat:` and `splat` reserved in `cde-store.mjs:1214-1215`, with a pin in `bridge/ledger-write.test.mjs`.
  - **The switch defaults to `off`**; production is unchanged until the founder sets it.
- **The drill switch:** CM rows run only if the founder sets `SENTINEL_WEB_EVIDENCE=drill` for the drill and back to `off` after. Every item and row then carries `web_mode:"drill"` and the words "counsel has not reviewed web evidence". Otherwise CM-1/2/3/5 and CX are **owed until counsel**; CM-4 and CM-6 still run.
- **Data (founder's OK per file):** 5 Commons photos of one building in a FoP-yes jurisdiction (GB), each **CC0-1.0, PDM or CC-BY-x** (SA is held, D-7-11), 2-8 MB each, with each file page saved as HTML (~50 KB). The pack's `asset.jurisdiction` is set to `GB` by the lead.
- **Rows:**
  - **SP-1.** Admit `splats/drill.ply` (synthetic) after (a)(c)(d) → admitted as `splat`. A `.ply` point cloud with no `opacity` → refused "this .ply is not a Gaussian splat (no opacity, scale_0, rot_0 in its header)".
  - **SP-2.** "Show in 3D": the splat appears in the world; the gizmo moves, rotates and scales it.
  - **SP-3.** "Save placement" → `splat:placed ev-000N` with `{matrix[16], sha256, actor, role, from_registration:null}`. Machine credential → 403.
  - **SP-4.** A reload places it from the newest row.
  - **SP-5.** A matrix with a mirror (det < 0) or a NaN → 400.
  - **CM-1 (drill row 6).** A lead signs (g), then admits 5 Commons photos (boxes or none-seen in the same form) → each `evidence:admitted` value carries licence, `web {source_url, author, attribution_text, retrieved_at, terms_sha256, freedom_of_panorama:"yes", delete_by, web_mode}`, `role:"context"`, attestation ids (a)(d)(g); plus `evidence:blurred` with `original_sha256` (file replaced).
  - **CM-2.** A scratchpad script compares each item with design §6.2's example field by field (:661-665) and lists any missing field with why.
  - **CM-3.** `CC-BY-NC-4.0` → refused "CC-BY-NC-4.0 is not admitted — a web photo's licence must allow commercial use: CC0, public domain or CC BY (CC BY-SA waits for counsel)". A `flickr.com` URL on a Commons item → refused. A `www.google.com` URL → RED words.
  - **CM-4.** Switch `off` → refused "a photo from a website waits for counsel's review — web evidence is off (the founder's switch SENTINEL_WEB_EVIDENCE); …", with an `evidence:refused` row.
  - **CM-5.** NOTICE lists the 5 lines with author, licence, URL and retrieved date (drill row 7).
  - **CM-6.** A contributor → 403 "a web photo is a lead's to admit (AMBER) — nothing was saved". Machine → 403.
  - **CX-1.** A Commons photo in `materials` → 400 "ev-00NN is a web photo — context only; it chooses no type".
  - **CX-2.** A survey job lists it refused with "context only (a web photo) — not read for geometry"; a ghost citation reads "context (assumed, web)".

### Batch 4: Photo Massing behind the pack (7-14) + the owed Revit rows. Needs Revit; no download.
- Built any time. **Merged only when the founder can close Revit and say "deploy"**, because the bridge refusal must land with the add-in that obeys it (D-7-27).
- **Deploy:** add-in 2021-2027 (every Revit closed first, never the founder's unsaved work); bridge restart; web none.
- **Rows:** PM-1 (bridge, machine: a `source:"photo"` changeset naming an unadmitted photo sha → 409 "Photo Massing read photos that are not admitted, blurred evidence (<sha12>…) — admit them in Files ▸ Evidence and blur them; nothing was filed"); PM-2, PM-3 and every owed Revit row (§8).

### Batch 5: packaging spike + registration (7-15, 7-16, 7-17, 7-18). Downloads, each on its own OK.
- **Order:**
  1. 7-15 first: download #0 (index metadata), then each §6 item, timed, licence-read, GO/NO-GO.
  2. 7-16 needs only YuNet.
  3. 7-17 Stage A spike RG-0 (pycolmap on 20 photos: registered count, reprojection px, control RMSE, check-point mm; blurred vs unblurred) before Stage B.
  4. 7-18 needs data, not software.
- **Deploy:**
  - `photo/` service 0.1.0, installed offline from `%USERPROFILE%\SentinelData\wheels-ma7\` with `--require-hashes` into `%APPDATA%\Sentinel\photo-lib`, pinned in `photo/requirements-ma7.txt` (rollback: delete the folder);
  - `SENTINEL_PHOTO_PYTHON` only if D-7-20 takes 3.12;
  - bridge restart once; web **1.0.90**; no add-in.
- **Data:** 20 of the founder's own photos of a place the drill scan covers (D8). An E57 with panoramas (the owner's preferred) for E5.
- **Rows:**
  - **K-0 … K-6.** One line per item: `<name> <version> · <source> · <MB> download · <MB> on disk · <min> install · Python <x> · GPU yes/no · licence files read: <list> · GO/NO-GO`.
  - **FD-1.** YuNet proposes boxes on the B-1 photo; the person confirms, adds the plate; `method:"detector+person"`.
  - **FD-2.** `evidence:blurred.tools` lists `yunet 2023mar MIT`, `onnxruntime 1.26.0 MIT`.
  - **RG-1.** 20 own photos → pycolmap → N posed.
  - **RG-2 (drill row 1).** The person picks ≥ 4 control pairs and 1 check point → shown "RMSE N mm on 4 points · check point M mm"; a contributor confirms → `evidence:registered` `{items, job, method, rmse_mm, check_mm, n_points, matrix_sha256, confirmed_by}`; `build:run … sentinel-photo 0.1.0` lists pycolmap + licence.
  - **RG-3.** RMSE > 50 mm needs a written reason; > 250 mm → 409 "rmse 610 mm is above 250 mm — not confirmed; re-shoot or pick other points".
  - **E5-1.** An E57 with panoramas → N photo items, each blurred, `registration.method "E57 scanner pose"`.
  - **E5-2.** A ghost wall projected into one panorama lands on the wall (screenshot).

### Batch 6: GPU (7-19, 7-20). Downloads (PyTorch, gsplat, DINO, SAM 2).
- **Step 0 spike T-0** (before 7-19's Stage B): 7,000 steps at half resolution, SH 0, on RG's 20 copies → minutes, peak VRAM (`torch.cuda.max_memory_allocated`), PLY MB, rendered by 7-11. NO-GO → D-7-25 (Brush on the founder's word, or row 8 owed).
- **Deploy:** `photo/` 0.2.0; bridge restart; web **1.0.91**; no add-in.
- **Rows:**
  - **GS-1.** A gsplat job on the registered blurred copies → a PLY admitted as `splat` with `made_with:"gsplat job-…"` (bridge-stamped), shown through 7-11, placed from the registration matrix.
  - **GS-2 (drill row 8).** Its `build:run` `tools` include `gsplat <v> Apache-2.0`, `torch <v> BSD-3-Clause`, and every other library and bundled runtime with its licence.
  - **GS-3.** NOTICE lists gsplat, torch and pycolmap.
  - **GS-4.** A job with one unblurred input → 409 "ev-NNNN has no blurred copy — splats are trained on blurred copies only; nothing was trained".
  - **OD-1.** On a registered photo, each ghost opening reads "seen in ev-… (detector, advice)" or "not seen"; a detection with no ghost is listed "no ghost — not filed".
  - **OD-2.** The receipt lists grounding-dino-tiny, sam2.1-hiera-small, transformers + licences.
  - **OD-R:** §8.

### Batch 7: the network web path (7-21 … 7-25). After counsel only.
- **Gate:**
  - counsel's written review exists, and its sha256 is in `SENTINEL_WEB_COUNSEL_REF`;
  - the founder approves the GREEN/AMBER/RED table, the allowed domains and the monthly cap (D5), and sets `SENTINEL_WEB_EVIDENCE=on`.
- **Build maps are written after counsel**, since their words depend on its answers. Nothing in batch 7 is built before then unless the founder asks (D-7-1).
- **Rows:**
  - **W-1.** A fetch from an allowed host records robots + TDM + terms snapshot in `evidence:fetched`.
  - **W-2.** A host with a TDM reservation → refused "<host> reserves text and data mining (tdmrep) — not fetched".
  - **W-3.** An OSM footprint admitted as context.
  - **W-4.** The planner offers it as an assumed outline where the scan has no coverage; the scan wins where it covers.
  - **W-5.** Mapillary only after (h) is signed.
  - **W-6.** A Flickr CC-BY lead → 7-12's admission with the SmugMug notice.
  - **W-7.** Claude web search gives leads within the cap; "floor plans of X" → "Sentinel never searches the web for a building's drawings — ask the owner (Files ▸ Evidence ▸ Ask the owner); nothing was searched".
  - **W-8.** Search before (a) → 409.

---

## 3. Decisions (default, and what would change it)

- **D-7-1 Order: the trust floor and ship-first.**
  - *Default:* batches 1-4 need no download and no counsel; downloads come in batches 5-6; the network in batch 7, built after counsel.
  - *Change if:* the founder wants registration (row 1) earlier. Then 7-15/7-17 move up after 7-7, since registration runs on blurred copies. Or the founder wants batch 7 built dark now; it then merges with every route refusing while off.
- **D-7-2 Image library: the installed Pillow 12.3.0 (MIT-CMU)**, pinned with `importlib.metadata.version("pillow") == "12.3.0"`, in a one-shot `survey/blur.py`. `sys.modules["pillow_heif"] = None`, and HEIC is not admitted.
  - *Change if:* the founder declines MIT-CMU. Then use a C# CLI with WPF imaging (`net8.0-windows`, `UseWPF`; builds offline), on the `drawing/` CLI pattern (`SENTINEL_BLUR_EXE`).
- **D-7-3 Blur = solid mean-colour fill of person-marked boxes**, which cannot be undone. "No faces or number plates in this photo" is an explicit answer, never a default. The words say "Sentinel does not find faces itself yet" until 7-16.
  - *Change if:* counsel says person marking is not enough. Then own photos are not viewable until 7-16.
- **D-7-4 Originals.**
  - An own original stays in the office folder, untouched. Sentinel never deletes or rewrites an office file and shows, reads and serves only the blurred copy once it exists.
  - A web original is replaced by its copy at admission (`original_sha256` kept), so no unblurred third-party copy remains [R2M 4.4].
  - *Change if:* counsel wants own originals blurred at source. Then "replace the original" becomes a lead's act.
- **D-7-5 Who sees an original:** a signed-in contributor+, only while no copy exists, with `Cache-Control: no-store`. A wrong blur is fixed by retire (7-5) + re-admit under a new name.
  - *Change if:* re-marking is common in the drill. Then add a lead's "clear copy".
- **D-7-6 Viewable bytes** (blurred photos, splats) travel by an authenticated bridge GET (the sheets/views precedent), never platform hidden files (§6.11). Byte routes live in `photo-store.mjs`, so `evidence-store.mjs` stays byte-free (test h).
  - *Change if:* Funnel speed (~7 MB/s, TO §6) is too slow for splats > 100 MB. Then use the `.3tz` hidden-files path.
- **D-7-7 Vision model: the installed `qwen3.6`**; `llava` is the fallback; `llama3.2-vision` is refused by the weights table.
  - *Change if:* M-0 fails both. Then `ollama pull qwen3-vl:8b` (§6 #12), with the founder's OK.
- **D-7-8 Evidence photos never leave this PC in MA-7.** The reader's Ollama URL must be 127.0.0.1/localhost/[::1], with no override (stricter than `SENTINEL_AI_CLOUD`, which governs chat).
  - *Change if:* a client opts in (7-27).
- **D-7-9 The web switch is the founder's env:**
  - `SENTINEL_WEB_EVIDENCE` = `off` (default) | `drill` | `on`;
  - `on` needs `SENTINEL_WEB_COUNSEL_REF` (64-hex sha of counsel's written review), else it stays off with words;
  - `drill` labels every item, row and NOTICE line "counsel has not reviewed web evidence";
  - it is read per call (the `SENTINEL_AI_CLOUD` pattern), so no lead or owner can turn it on.
  - *Change if:* the founder wants it per office. Then use an owner-signed office artefact (one more slice).
- **D-7-10 Attestation (g)** for web photos: "I opened each web photo's own page at its source, checked that its licence allows us to view it for this asset, and recorded its author, licence and attribution as the page gives them." A web photo needs (a)(d)(g); (c) is for own capture only. Attestations go to at most 7. (h) "I accepted <source>'s commercial terms for this office" comes with 7-23.
  - *Change if:* counsel rewords it. The text is pinned by sha, so it changes before 7-12 merges, or becomes a new code.
- **D-7-11 Web photo licences:** `CC0-1.0`, `PDM-1.0`, `CC-BY-2.0/2.5/3.0/4.0`. **CC BY-SA is held** for counsel (Q2); NC and ND are never admitted.
  - *Change if:* counsel clears SA for context-only viewing (most Commons photos are SA, R10).
- **D-7-12 Web items are context only:** `geometry_extraction:false`, no type choice, "assumed" everywhere.
  - *Change if:* never in MA-7 (§4.4 role).
- **D-7-13 Freedom of panorama** from `asset.jurisdiction` (two letters):
  - yes: GB, US, DE, SA;
  - no: JO, AE, EG, FR, IT;
  - "no" or unknown → refused, marked "not legal advice; counsel confirms".
  - *Change if:* counsel gives a table, or says context viewing is fine where FoP is absent.
- **D-7-14 The Street View rows use labelled stand-ins** made from Sentinel's own viewer. No Google capture is made. The refusal rests on the person's answer, (d) and camera data.
  - *Change if:* never.
- **D-7-15 Expiry timing:** the sweep runs at start, every 6 h and right after a set. The words say "within 6 hours after its delete-by date". A file whose bytes changed is left in place and said.
  - *Change if:* Flickr's 24 h (7-24). Then the interval drops to 1 h.
- **D-7-16 Licence pending list** (warns; the founder decides each):
  - `@markerjs/markerjs3` (Linkware: show its credit link, buy, or drop it; it is imported in `src/main.ts` only);
  - `fast-sha256` (Unlicense; accept, or swap for Web Crypto);
  - `duck` ("BSD": read its text);
  - `xmlhttprequest-ssl` (no lockfile field: read its package.json);
  - ISC × 5 (MIT-equivalent);
  - Pillow MIT-CMU (D-7-2);
  - Nice3point Revit API reference packages (compile-only, not shipped);
  - filelock (Unlicense, with torch, batch 6).
  - `jszip` passes as MIT through its OR.
  - *Change if:* the founder wants pending to fail. Then CI fails once these are settled.
- **D-7-17 Registration:** pycolmap (CPU wheel), then the person's ≥ 4 control pairs + 1 held-out check point, then numpy Umeyama. Amber above 50 mm needs a written reason; refused above 250 mm (photo geometry ~120 mm at best [R2M 3.8]). ICP only if RG-0 shows it lowers the check-point error. TEASER++/Open3D not taken. `map-anything-apache` only if pycolmap fails. A contributor confirms (as a scan's registration).
  - *Change if:* RG-0 shows control picking too slow, or the founder sets the limits.
- **D-7-18 Detectors:** faces by YuNet (MIT) on the installed onnxruntime; plates by the person (YOLO-family plate models are AGPL/GPL, banned).
  - *Change if:* the founder declines YuNet. Then WinRT `FaceDetector` (Windows SDK, no download) gets a spike in a C# CLI. Or a permissive plate model is found.
- **D-7-19 Grounding DINO + SAM 2 runtime:** PyTorch + transformers (PyTorch is needed by gsplat anyway); community ONNX conversions are not taken.
  - *Change if:* the founder declines PyTorch. Then 7-20 is dropped and openings stay scan- and person-confirmed.
- **D-7-20 Python for the GPU stack:** cp314 if download #0 shows Windows wheels for pycolmap/torch/gsplat; else a private embeddable 3.12 at `%APPDATA%\Sentinel\gpu-py`, never replacing `C:\Python314`.
  - *Change if:* never; the index decides.
- **D-7-21 Versions:**
  - `survey/blur.py` = "sentinel-blur 0.1.0" (a one-shot script, in the survey test discover);
  - `photo/service.py` = "sentinel-photo 0.1.0" (from batch 5, own lib folder);
  - the bridge reader = "photo-reader 0.1.0";
  - `survey/service.py` stays 0.6.0.
  - *Change if:* the founder prefers one service. Then fold into survey 0.7.0.
- **D-7-22 Migration:** none.
- **D-7-23 Vision reads run as jobs** (the build-jobs runner: one at a time, poll, `build:run` written by the runner), not a synchronous route. A qwen3.6 call takes 10-109 s (P-1). One photo per job, a 180 s call timeout, said in words.
- **D-7-24 PDAL/COPC:** K-0 reads a COPC sample with installed laspy 2.7.0 + lazrs. PDAL (conda) is recorded in K rows, not installed, unless a product slice needs it (none planned).
- **D-7-25 Splats:**
  - PLY only (Spark reads it; 3DGS header check), cap 256 MB, SH degree 0 from 7-19 (matte, like the platform converter; ~12 MB per 200k);
  - published-app failure → local app only, said;
  - Brush (Apache-2.0, wgpu, no CUDA) only on the founder's word, because it changes row 8's words.
  - *Change if:* SPZ is wanted (add `spz` with its magic).
- **D-7-26 Pack cap 100 stays.** Registration and E57 rows use their own scratch project if the drill pack nears it (R7).
- **D-7-27 Photo Massing behind the pack (7-14)** merges only with its add-in deploy.
  - *Change if:* the founder wants unadmitted photos for internal demos. Then a label "photos not evidence — assumed" applies instead of a refusal.
- **D-7-28 Roles:**
  - admit an own photo = contributor;
  - mark boxes = contributor;
  - delete-by/retire = lead;
  - admit a web photo = lead;
  - sign (g) = lead;
  - confirm a registration = contributor;
  - save a splat placement = contributor (a view, not a model change);
  - the switch = the founder's env;
  - the machine credential is 403 on every person act.
- **D-7-29 Material values** come from the guideline's Walls rules' `when.params.Material` (case-insensitive equality). A set where one value contains another is refused, because of the typer's substring match.
- **D-7-30 The item whitelist widens in the same commit** as each slice that writes a field.

---

## 4. Build maps for batch 1

Binding from earlier batches:
- the bridge stamps every trust field (`actor()` = `resolveActor(null,"machine")`, `evidence-store.mjs:125`);
- ledger rows record what happened;
- words shown to people end with what was (not) done;
- store tests inject every dep and read no file outside a temp folder (CI Node 22, 5 s vitest timeout);
- process-spawning tests set explicit timeouts;
- fixtures use `example.test` names;
- `bridge/write-roles.test.mjs` gains each new route with 4 people (viewer, contributor, lead, machine).

Route pattern (`bridge/bcf-service.mjs:1677-1690`): `p1` key, `p2` "evidence", `p3` pack, `p4` verb or "items", `seg[5]` item id, `seg[6]` item verb.

### 7-1 Licence gate (S/M; branch `feature/ma7-1-licence-gate`)

**Bridge, pure: `bridge/licence-logic.mjs` (new; imported by the CLI and by 7-8)**
1. `ALLOWED = ["MIT","BSD-2-Clause","BSD-3-Clause","Apache-2.0","BSL-1.0","MPL-2.0","0BSD","Zlib","CC0-1.0","PSF-2.0"]` (design §6.10, with the 2026-10-08 additions).
2. `PENDING = ["ISC","MIT-CMU","Unlicense","BSD"]` (D-7-16).
3. `ALIAS = {"MIT License":"MIT","Apache 2.0":"Apache-2.0","Apache Software License":"Apache-2.0","BSD License":"BSD"}`.
4. `BANNED_NAMES` = §6.10's list as lower-case package names: `cloudcompare, libredwg, openmvs, opendronemap, odm, pymupdf, fitz, ultralytics, bonsai, dust3r, mast3r, diff-gaussian-rasterization, cubicasa5k, sonata, scenescript, spatiallm, a-scan2bim`.
5. `verdict(expr, row = {})` → `{v: "allowed"|"pending"|"banned"|"unknown", why}`.
   - Trim, then apply `ALIAS`.
   - `""`, `"SEE LICENSE IN …"` → unknown.
   - `UNLICENSED` → banned "not licensed for reuse".
   - Strip outer parentheses. Split on ` OR ` and take the **best** part; split on ` AND ` and take the **worst**.
   - Atoms:
     - `/\bA?GPL-/i` → banned "GPL and AGPL are not shipped (design §6.10)" (the `\b` keeps LGPL out);
     - `/\bLGPL-/i` → banned "LGPL only as a separate process", unless `row.process === "separate"`;
     - `/\bSSPL\b|(^|-)NC(-|$)|NonCommercial|(^|-)ND(-|$)|NoDerivatives|\bLlama-[\d.]+-Community\b/i` → banned;
     - `ALLOWED` → allowed; `PENDING` → pending; else unknown.
   - A name in `BANNED_NAMES` is banned whatever its field.
6. `WEIGHTS`:
   ```js
   {
     "qwen3.6:latest": { digest: "3899b1c0e7c5", licence: "Apache-2.0" },
     "llava:latest": { digest: "8dd30f6b0cb1", licence: "Apache-2.0" },
     "llama3.2-vision:latest": { digest: "6f2f9757ae97", licence: "Llama-3.2-Community" },
   }
   ```
   `// ponytail: hand-kept like survey/service.py INSIDE; a new model is a download OK plus a row here`.
7. `modelRefusal(name, digest12)` → null, or:
   - `${name} is licensed ${licence} — not on Sentinel's allow-list (design §6.10); nothing was read`;
   - for an unknown name or a digest mismatch: `${name}${digest12 ? ` (${digest12})` : ""} is not in Sentinel's weights table — a model is used only once its licence is read and listed (tools/licence-check); nothing was read`.
8. `checkAll({npm, python, nuget, weights, allow})` (pure; the CLI feeds it).
   - Each row `{source, name, version, licence, process?}`. `allow.accepted[name]` makes it allowed (unless banned and not LGPL-separate); `allow.pending[name]` makes it pending.
   - Returns `{lines, banned, unknown, pending, code}`, with `code = banned + unknown > 0 ? 1 : 0`.

**CLI: `tools/licence-check/check.mjs` (new; Node ≥ 22; imports only `node:` and `../../WebApp/bridge/licence-logic.mjs`)**
- `readNpm(lockPath, nmRoot)`:
  - every `packages` key but `""`; the name is the text after the last `node_modules/`;
  - the licence is the `license` field; when it is missing or an object, `node_modules/<name>/package.json` `license`, or `licenses[].type` joined ` OR `.
- `readPython(root)`:
  - the keys of `PINS = {…}` in `survey/las.py` (regex `/PINS\s*=\s*\{([^}]*)\}/`);
  - every `name==` line of `survey/requirements*.txt` and `photo/requirements*.txt`;
  - plus `allow.python_runtime` (`python`, `numpy`).
  - Each name must have an `allow.python` row `{version, licence, carries?}`; no row → unknown.
- `readNuget(root)`: `<PackageReference Include="X"` in every `*.csproj` under `SentinelAddin/`, `drawing/` and `tools/` (recursive `readdirSync`, skipping `bin`/`obj`). Each name must have an `allow.nuget` row.
- Weights: every `WEIGHTS` row.
- Arguments: `--lock <path>` (default `WebApp/package-lock.json`); `--root <repo>` (default two levels above the script).
- Output:
  - first `licence-check: <n> npm, <p> python, <q> nuget, <w> weights — banned <b>, unknown <u>, pending <k> (warn: the founder's decision D-7-16)`;
  - then one line each: `BANNED <name>@<version> <licence> (<source>) — <why>`, `UNKNOWN <name>@<version> "<licence>" (<source>) — read its licence and add it to tools/licence-check/allow.json, or replace it`, `pending <name>@<version> <licence> (<source>)`.
  - `process.exit(code)`.

**`tools/licence-check/allow.json` (new)**
- `python`:
  - numpy 2.4.6 `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`;
  - laspy 2.7.0 BSD-2-Clause;
  - lazrs 0.8.2 MIT, carries laz 0.12.2 Apache-2.0;
  - pye57 0.4.19 MIT, carries libE57Format BSL-1.0 and Xerces-C++ 3.2.3 Apache-2.0;
  - pyquaternion 0.9.9 MIT;
  - python 3.14 PSF-2.0.
- `nuget`:
  - PdfPig 0.1.16 Apache-2.0;
  - System.Security.Cryptography.ProtectedData MIT;
  - System.Text.Json MIT;
  - Nice3point.Revit.Api.RevitAPI and Nice3point.Revit.Api.RevitAPIUI → `pending`, "compile-time reference assemblies of Autodesk's Revit API (not shipped)".
- `pending`: `@markerjs/markerjs3`, `fast-sha256`, `duck`, `xmlhttprequest-ssl`, each with `read` (what the file says) and `decision: "D-7-16"`.
- `accepted: {}`.
- 7-7 adds pillow 12.3.0 MIT-CMU; every §6 item adds its row when OK'd.

**CI: `.github/workflows/ci.yml`**, `web` job, after `- run: npm run prepare` (working directory `WebApp`): `- run: node ../tools/licence-check/check.mjs`.

**Tests: `bridge/licence-logic.test.mjs`** (vitest; CI runs it through `npm run test`; no file read)
- `verdict`:
  - allowed: `MIT`, `(MIT OR GPL-3.0-or-later)`, `(MIT AND Zlib)`, `MIT License`, the numpy expression;
  - banned: `GPL-3.0-only`, `AGPL-3.0`, `CC-BY-NC-4.0`, `Llama-3.2-Community`;
  - `LGPL-2.1-only` banned, but allowed with `{process: "separate"}`;
  - pending: `ISC`; unknown: `SEE LICENSE IN LICENSE`, `""`;
  - `ultralytics` with `MIT` → banned.
- `modelRefusal`:
  - qwen3.6 with 3899b1c0e7c5 → null;
  - llama3.2-vision → the banned words;
  - qwen3.6 with another digest → the unknown words;
  - `foo:1` → the unknown words.
- `checkAll`:
  - a planted `GPL-3.0-only` npm row → code 1 and a line starting `BANNED`;
  - a PINS name with no python row → `UNKNOWN`, code 1;
  - only pending rows → code 0.

**Drill rows**
- **LC-1.** On master, `node tools/licence-check/check.mjs` exits **0**. It prints the summary with `banned 0, unknown 0, pending 11` and pending lines for markerjs3, fast-sha256, duck, xmlhttprequest-ssl, ISC ×5 and the two Nice3point packages. jszip is not listed (allowed through its MIT).
- **LC-2.** `--lock scratchpad/ma7/lock-gpl.json` (a copy with one package set to `GPL-3.0-only`) exits **1** with `BANNED <name>@<ver> GPL-3.0-only (npm) — GPL and AGPL are not shipped (design §6.10)`.
- **LC-3.** The push's CI run shows the step green.

### 7-2 Counsel switch + source lists (S; branch `feature/ma7-2-web-switch`)

**Bridge, pure: `bridge/web-sources.mjs` (new)**
1. `SOURCES`, one row each: `{id, list, label, hosts, kinds, licences, terms_url, max_keep_days, needs_acceptance, held_for_counsel}`.
   - **GREEN** (all `held_for_counsel: true`):

     | id | hosts | licences / note |
     |---|---|---|
     | `osm` | openstreetmap.org, overpass-api.de | ODbL-1.0 |
     | `overture` | overturemaps.org | CDLA-Permissive-2.0, ODbL-1.0 |
     | `ms-footprints` | github.com/microsoft/GlobalMLBuildingFootprints | ODbL-1.0 |
     | `copernicus` | dataspace.copernicus.eu | Copernicus data licence |
     | `mapillary` | mapillary.com, graph.mapillary.com | CC-BY-SA-4.0; `needs_acceptance: true` |
     | `kartaview` | kartaview.org | CC-BY-SA-4.0 |
     | `panoramax` | panoramax.fr | CC-BY-SA-4.0 |

   - **AMBER:**
     - `wikimedia-commons`: commons.wikimedia.org, upload.wikimedia.org; `CC0-1.0`, `PDM-1.0`, `CC-BY-2.0`, `CC-BY-2.5`, `CC-BY-3.0`, `CC-BY-4.0`; `held_for_counsel: true`; `max_keep_days 365`.
     - `flickr`: flickr.com, www.flickr.com, live.staticflickr.com; same licences; `max_keep_days 180`.
     - `openverse`: openverse.org, api.openverse.org; `kinds: ["lead"]` (never evidence).
   - **RED:**
     - `RED_LABELS = ["google","googleapis","gstatic","ggpht","googleusercontent","goo","apple","mzstatic","bing","virtualearth"]`, matched as **whole host labels**;
     - `RED_HOSTS = ["atlas.microsoft.com"]`, exact or dot-suffix.
   - `// ponytail: hand-kept table; a new source is the founder's approval (D5) plus a row here`.
2. `SOURCES_SHA256` = sha256 of `JSON.stringify({SOURCES, RED_LABELS, RED_HOSTS})`.
3. `classifyHost(url)`:
   - parse an `https:` URL, lower-case the hostname;
   - RED by label or host → `{list: "RED", id}`;
   - else a row whose host equals it or is a dot-suffix of it → `{list, id}`;
   - else null.
   - Never a substring: `bingham.example.test` is not RED.
4. `webSwitch(env = process.env)` → `{mode, why, counsel_ref12}`:
   - `SENTINEL_WEB_EVIDENCE` trimmed and lower-cased;
   - `"drill"` → drill;
   - `"on"` with `/^[0-9a-f]{64}$/` in `SENTINEL_WEB_COUNSEL_REF` → on;
   - `"on"` without it → off with `ON_NO_REF`;
   - anything else → off with `OFF`.
5. Words:
   - `OFF = "web evidence is off until counsel has reviewed it (design D5) — the founder's switch SENTINEL_WEB_EVIDENCE; nothing was searched, fetched or saved"`
   - `ON_NO_REF = "SENTINEL_WEB_EVIDENCE=on needs SENTINEL_WEB_COUNSEL_REF, the sha256 of counsel's written review — web evidence stays off; nothing was saved"`
   - `DRILL = "web evidence is on for a drill — counsel has not reviewed web evidence; every web item says so"`
   - `NO_A = "a lead signs (a), the owner's authority, before any web evidence — nothing was searched or saved"`
6. `webRefusal(pack, env)` → `{status: 403, words: OFF|ON_NO_REF}`, or `{status: 409, words: NO_A}` when (a) is not signed, or null. 7-12 and batch 7 call it first.

**Bridge, store: `bridge/evidence-store.mjs`**
- `export async function webStatus(key, packId, deps)`: the member check `readPack` uses, then `packOf`, then `webSwitch(d.env ?? process.env)`. Returns `{mode, why, counsel_ref: counsel_ref12 ?? null, a_signed, sources: SOURCES.map(({id, list, label, licences, held_for_counsel}) => ({id, list, label, licences, held_for_counsel})), red: {labels: RED_LABELS, hosts: RED_HOSTS}, sources_sha256}`. No other env value is echoed.
- Imports `./web-sources.mjs`. **Pin that moves:** test (h)'s `allowed` list (`evidence-store.test.mjs:198`) gains `"./web-sources.mjs"` with the comment `// MA-7-2: a pure table, no I/O`.

**Route:** `bridge/bcf-service.mjs` evidence block: `if (p3 && p4 === "web" && !seg[5] && req.method === "GET") return send(res, 200, await ev.webStatus(p1, p3));`. The route comment at `:1672-1676` gains one line.

**Web**
- `src/setups/evidence.ts`:
  - `WebStatus` type;
  - `readWebStatus(base, key)`;
  - `webLine(s)` →
    - off: `Web evidence: off — counsel has not reviewed it yet (D5). Your own photos and scans are admitted as before.`
    - drill: `Web evidence: DRILL — the founder's switch; counsel has not reviewed web evidence.`
    - on: `Web evidence: on (counsel ref <12>…)`.
- `src/setups/files-panel.ts` `evidenceSection()` (`:619`): the line under the attestations, loaded with `readEvidence`.

**Tests**
- `bridge/web-sources.test.mjs`:
  - `classifyHost`: RED for `https://maps.google.co.uk/x`, `https://lh3.ggpht.com/x`, `https://t0.tiles.virtualearth.net/x`, `https://maps.apple.com/x`, `https://atlas.microsoft.com/x`; AMBER commons for `https://upload.wikimedia.org/x`; null for `https://bingham.example.test/x` and `http://commons.wikimedia.org/x` (not https);
  - `webSwitch`: unset → off/OFF; `"on"` without ref → off/ON_NO_REF; `"on"` + 64 hex → on, with `counsel_ref12` 12 chars; `"drill"` → drill;
  - no id in two lists; every GREEN/AMBER row `held_for_counsel: true`; `SOURCES_SHA256` 64 hex and stable.
- `bridge/evidence-store.test.mjs` (v): `webStatus` for a viewer → `mode:"off"`, with no `SENTINEL_` value in `JSON.stringify(result)` other than the 12-hex ref; `env` injected.
- `src/setups/evidence.test.ts`: `webLine` for the three modes.
- `bridge/write-roles.test.mjs`: GET …/web for 4 people → 200 each (a read).

**Drill rows**
- **O-1.** `GET /cde/ma4c-drill/evidence/evp-0001/web` → `{mode:"off", why: OFF, …, sources_sha256}`. The panel shows the off line (screenshot).

### 7-3 Guards (S; branch `feature/ma7-3-guards`)

**Bridge**
1. `bridge/evidence-logic.mjs`:
   - `export const ITEM_FIELDS = ["id","kind","format","sha256","size_bytes","path","provider","licence","licence_ref","request_id","attestation_ids","allowed_uses","registration","surveyable","admitted_by","admitted_at","state","changed_sha256","changed_at","capture","delete_by","delete_why","expired_at","removed"]`. The first 19 are what `newItem` (`:235-249`) and `flagged` (`:252`) write today; `capture` comes from 7-4 and the last four from 7-5.
   - In `validatePack`'s item loop, right after `if (!isObj(x))`: `const s = Object.keys(x).find((k) => !ITEM_FIELDS.includes(k)); if (s !== undefined) throw bad(\`${at}.${s}\`, "is not an item field — the bridge writes items; an unknown field is never stored");`.
   - Comment: `// MA-7-3: each slice that writes a new item field adds it here in the same commit (D-7-30)`.
2. `bridge/changesets-logic.mjs`, two pure functions called in `validateChangeset` (`:426`) right after `const source = sourceOf(body.source, note)` (`:457`):
   - `imageryRefusal(body)` walks each element's values **except** `reason`, `evidence`, `validate` and `name`. It refuses:
     - a key matching `/^(texture|textures|image|images|bitmap|photo|photo_path|render_appearance)$/i`;
     - a string starting `data:image/`;
     - a string longer than 64 starting `/9j/` (JPEG base64) or `iVBORw0KGgo` (PNG base64);
     - a string ending `/\.(jpe?g|png|heic|webp|ply|spz|splat)$/i`.
     - Words: `imagery is never put into the model (RVT or IFC) — ${path} carries ${what}; nothing was filed`, where `what` is "an image key", "an image as text" or "an image file name", and `path` is `elements[i].…`.
     - `// ponytail: name and byte checks, not image decoding — ops carry no file field, so a renamed image still has no route into Revit`.
   - `photoKindRefusal(body, source)`: when `source === "photo"`, the first element with `op === "create"` and a `kind` not in `["mass","level"]` → `a photo never creates a ${kind} on its own — photos confirm a ghost or choose its type (design 4.2); nothing was filed`.
   - Both throw `err(400, …)`.

**Tests**
- `bridge/evidence-logic.test.mjs`:
  - a stray item field `foo` → 400 naming `items[0].foo`;
  - the **replay guard**: an in-file list of every historical item shape validates unchanged:
    - MA-4a own scan with registration;
    - RCP with report path + sha;
    - flagged photo (`state`, `changed_sha256`, `changed_at`);
    - drawing under a request;
    - dataset scan;
    - vendor model with `licence_ref`;
    - own concept IFC.
- `bridge/changesets-logic.test.mjs`:
  - a `set_parameter` whose `to` is `data:image/png;base64,iVBOR…` → 400 with `elements[0].to`;
  - a 100-character `/9j/…` → 400;
  - a facts param `Image: "a.jpg"` → 400;
  - a `texture` key → 400;
  - a `reason` naming `photos/x.jpg` → passes;
  - `source:"photo"` with 2 levels + 1 mass → passes;
  - `source:"photo"` with a wall create → 400 with the words;
  - `source:"photo"` with a `set_parameter` → passes (not a create).
- Full `npx vitest run bridge src/setups` (shared fixtures under `fixtures/changeset-ops/*.json` must still pass; a fixture holding an image name is a finding, not silently changed).

**Drill rows**
- **G-1.** Machine credential `POST /changesets/ma4c-drill` with a `set_parameter` whose value is `data:image/png;base64,iVBORw0KGgo…` (> 64 chars) → 400 `imagery is never put into the model (RVT or IFC) — elements[0].to carries an image as text; nothing was filed`.
- **G-2.** `source:"photo"` with a `wall` create → 400 `a photo never creates a wall on its own — photos confirm a ghost or choose its type (design 4.2); nothing was filed`.
- **G-3 (replay).** Before the restart is announced, `GET …/evidence/evp-0001` on `ma4a-drill`, `ma4c-drill` and the MA-4h dataset drill project → 200 each, item counts unchanged.

### 7-4 Photo intake: source + camera data (S/M; branch `feature/ma7-4-photo-intake`)

**Bridge, pure: `bridge/evidence-logic.mjs`**
1. `RED_PHOTO = ["street view", "streetview"]`. In `policyRefusals` (`:126-128`), the RED test becomes `… : RED.some((r) => provider.includes(r)) || (kind === "photo" && RED_PHOTO.some((r) => provider.includes(r)))`. The words at `:128` stay exactly as they are (they name (d)).
2. `policyRefusals({kind, provider, path, dataset, webMode = "off"})`: the `:131` branch splits.
   - `kind === "photo"` → `a photo from a website waits for counsel's review — web evidence is off (the founder's switch SENTINEL_WEB_EVIDENCE); only your own photos (provider own) are admitted now`. 7-12 replaces this branch when `webMode !== "off"`.
   - A scan keeps the old words.
3. `cameraOf(buf)`, pure, ~50 lines:
   - JPEG `FF D8`; walk segments to APP1 `FF E1` whose payload starts `Exif\0\0`;
   - TIFF header `II*\0` or `MM\0*`;
   - IFD0 tags `0x010F` Make and `0x0110` Model (ASCII; trim; ≤ 64 chars; control characters removed);
   - `0x8769` → Exif IFD `0x9003` DateTimeOriginal → `taken_at` "YYYY-MM-DD HH:MM" or null;
   - `0x8825` present → `gps: true` (**its values are never read**);
   - every offset is bounds-checked against `buf.length`; a malformed IFD → null.
   - Returns `{make, model, taken_at, gps}`, or null when there is no APP1, or neither Make nor Model.
4. `photoRefusal({format, camera})`:
   - `format === "png"` → `a .png photo is a screenshot or an export — a camera writes JPEG: admit the camera's original file (attestation d)`;
   - `!camera` → `this photo carries no camera data (EXIF make and model) — a screenshot or a saved web image is not admitted as your own photo (attestation d); admit the camera's original file`;
   - else null.
5. `newItem` (`:235`): `...(input.capture ? { capture: input.capture } : {})`. `admittedValue` (`:255`) carries `capture` when present.
6. `validatePack`: `capture`, when present, has exactly `{make, model, taken_at, gps}` (make/model a string ≤ 64 or null, at least one set; taken_at a string ≤ 16 or null; gps boolean), only on `kind === "photo"`.

**Bridge, store: `bridge/evidence-store.mjs`**
1. `readHead(full, n = 16)` (`:41`) and `hashFile(full, headBytes = 16)` (`:53`) gain the size parameter; default behaviour is unchanged.
2. `admitRun` (`:217`):
   - pass `webMode: webSwitch(d.env ?? process.env).mode` into `policyRefusals` (`:249`);
   - for a **new** photo (`!prev && input.kind === "photo"`), after the magic and size checks (`:252-255`): `cam = L.cameraOf(await readHead(full, 131072)); const pr = L.photoRefusal({format, camera: cam}); if (pr) return refuse([pr]);`;
   - hash with `hashFile(full, 131072)` and re-check `JSON.stringify(L.cameraOf(f.head)) === JSON.stringify(cam)`, else `refuse(["changed while read"], f.sha256)`;
   - `input = {...input, capture: cam}`.
   - A flagged photo coming back is not re-checked: it returns as first admitted (`:236`).

**Web**
1. `src/setups/evidence.ts`:
   - `PHOTO_SOURCES = [{id:"own", label:"My own camera (the camera's original file)"}, {id:"map", label:"A map service"}, {id:"web", label:"A website (Wikimedia Commons, Flickr …)"}]`;
   - `MAP_SERVICES = ["Google Street View","Google Maps","Google Earth","Apple Maps","Bing Maps","Azure Maps"]`;
   - `photoProvider(source, service)`: own → undefined, map → `service.toLowerCase()`, web → `"website"`;
   - `EvidenceItem.capture?`;
   - `itemLine` (`:50`) for a photo with capture appends ` · ${make} ${model} · taken ${taken_at ?? "?"} · ${gps ? "location in the original only (not copied)" : "no location recorded"}`.
2. `src/setups/files-panel.ts:408-412`: a **new** photo's Admit opens an inline form (radio + a `<select>` shown for "A map service") and posts `admitEvidence(base, pid(), {path, kind: "photo", provider})`. A flagged photo coming back stays one click.

**Tests**
- `bridge/evidence-logic.test.mjs`:
  - `cameraOf`: a hand-built JPEG (helper `jpegWithExif({make, model, taken, gps, endian})` in the test file) → the record; no APP1 → null; a truncated IFD → null; `MM` big-endian read; GPS present → `gps: true` and `JSON.stringify` holds no `lat`/`lon`/coordinate;
  - `photoRefusal` words;
  - `policyRefusals`: `{kind:"photo", provider:"street view"}` → RED words; `"website"` → the website words; scan `x` → the old words. **The test at `:60` changes its web-photo case.**
- `bridge/evidence-store.test.mjs`:
  - **pins that move:** test (a) (`:43`) and every other test that admits a **new** photo now writes `jpegWithExif(...)` bytes;
  - new cases: a screenshot JPEG (no EXIF) → refused row with the words; a PNG photo → refused; a camera JPEG → admitted with `capture` on item and row; a flagged PNG photo re-admitted unchanged → admitted.
- `src/setups/evidence.test.ts`: `photoProvider`; the capture line.

**Drill rows**
- **SV-1 (drill row 5, named source).** `photos/streetview-standin.png` admitted as "A map service: Google Street View" → 200 refused, `google street view is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)`, plus the row `evidence:refused photos/streetview-standin.png` and a hold `evidence:photos/streetview-standin.png`. The record says: "a stand-in made from Sentinel's own viewer; no Google capture was made (D-7-14)".
- **SV-2 (unnamed screenshot).** `photos/screenshot-standin.jpg` (no EXIF) as "My own camera", with (a)(c)(d) signed → 200 refused with the no-camera words, a row and a hold.
- **SV-3.** The same JPEG as "A website" → the website words.
- **SV-4.** The founder's phone JPEG → 201. The item line ends with make, model, taken and "location in the original only (not copied)". The `evidence:admitted` row has `capture {…, gps: true}`. A scratchpad script finds no coordinate in the row. **Owed** if no camera JPEG is on the PC.
- The record states the ceiling: "a camera JPEG re-saved with EXIF passes; the person's answer, (d) and camera data are the guards, not proof".

### 7-5 `delete_by`, expiry, retire (S/M; branch `feature/ma7-5-delete-by`)

**Bridge, pure: `bridge/evidence-logic.mjs`**
1. `readDeleteBy(b, today)`.
   - `b.date` must be `"YYYY-MM-DD"` (a real calendar date), at least `today` and at most `today` + 3650 days. Else 400 `delete_by must be a date from today (today retires it now) to ten years ahead, as 2026-12-31 — nothing was saved`.
   - `b.why` is optional, one line ≤ 300.
   - Returns `{delete_by, why}`.
2. `due(pack, today)` → items with `delete_by && delete_by <= today && state !== "expired"`.
3. `removable(i)` → the paths Sentinel may delete:
   - `.sentinel/view/${i.id}.jpg` when `i.view_copy` (from 7-7);
   - `i.path` only when `i.role === "context"` (a web item, from 7-12);
   - **never an own, drawing, dataset or vendor file.**
4. `expire(i, at, removed)` → `{...i, state: "expired", expired_at: at, removed}`.
5. `expiredValue(packId, i, version)` → `{pack_id, item_id, path, sha256, kind, provider, licence, delete_by, expired_at, removed, kept: "hash and record", office_file: i.role === "context" ? null : "not touched — delete it by hand if the owner asked", pack_version}`.
6. `validatePack` (`:338`):
   - `state` is `"changed"`, `"expired"` or absent;
   - `"expired"` needs a string `expired_at` and `removed`, an array (≤ 2) of safe relative paths;
   - `delete_by` is absent or `YYYY-MM-DD`; `delete_why` is absent or a string ≤ 300;
   - its words: `is "changed", "expired" or absent`.
7. `readAdmitBody` (`:87`): a path whose first segment is `.sentinel` → 400 `.sentinel/ is Sentinel's own folder (blurred copies) — nothing was saved`.

**Bridge, store: `bridge/evidence-store.mjs`**
1. `export async function setDeleteBy(key, packId, itemId, b, deps)`. Checks, in this order:
   1. `myRole === "service"` → 403 `a delete-by date needs a person — it names who set it: sign in. Nothing was saved.`;
   2. `officeProject(d, key, "lead")`;
   3. `takeWriteBudget("evidence delete-by", {perUser: 20, all: 60})`;
   4. the `admitting` lock (shared with admission);
   5. `packOf`;
   6. the item exists (404 `no item ${itemId} in ${packId} — nothing was saved`);
   7. it is not expired (409 `${itemId} expired on ${date} — its record stays and cannot change; nothing was saved`).
   - Then `fold` with `delete_by`/`delete_why` and the row `evidence:delete_by ${itemId} ${date}` `{pack_id, item_id, path, sha256, delete_by, why, actor}`.
   - If it is due now, run `sweepRun` inside the same lock.
   - Returns `{item, pack_version, ledger: [rows]}`.
2. `sweepRun(d, proj, key)` (no lock of its own; callers hold `admitting`). For each `due` item:
   - for each `removable(i)` path: `full = insideFolder(dir, p)`;
     - if the file exists and its sha equals the item's (`sha256` for `path`, `view_copy.sha256` for the copy), `unlinkSync(full)` and add `p` to `removed`;
     - else leave it, noting `"<p>: not the admitted bytes — left in place"`.
   - Then one `fold` for all items, and one row per item, `evidence:expired ${id} ${path}` with `expiredValue` (actor = machine).
   - `// ponytail: sequential hashing of each removable file; a pack of many big copies takes minutes — hash in parallel if a NAS pack is slow`.
3. `export function startExpirySweep({every = 6 * 3600_000, deps} = {})`.
   - At start and each interval: for each folder under `evidenceRoot()` whose project has a pack, take `admitting` (skip if busy), then `sweepRun`.
   - Errors go to the bridge log only; the timer is `.unref()`'d. Returns the timer.
4. `recheckRun` (`:316`): `if (i.state === "expired") { items.push(i); continue; }`, and `checked` excludes expired items.
5. `admitRun` (`:229`): `prev?.state === "expired"` → 409 `${path} was ${prev.id}, expired on ${date} (delete-by) — put the file in under a new name; nothing was saved`.
6. `folderFiles` (`:130-141`): skip `rel.startsWith(".sentinel/")`. Expired paths stay in `taken` (not listed).

**Other bridge files**
- `bridge/build-jobs.mjs` `pickItems` (`:142`): a first reason `i.state === "expired" ? \`expired on ${i.expired_at.slice(0, 10)} (delete-by) — not read\``.
- `bridge/bcf-service.mjs`:
  - evidence block: `if (p3 && p4 === "items" && seg[5] && seg[6] === "delete-by" && req.method === "POST") return send(res, 200, await ev.setDeleteBy(p1, p3, seg[5], await body()));`;
  - in the `server.listen` callback (`:541`): `(await import("./evidence-store.mjs")).startExpirySweep();`.

**Web**
1. `src/setups/evidence.ts`:
   - `EvidenceItem` gains `delete_by?`, `state?: "changed" | "expired"`, `expired_at?`, `removed?`;
   - `setDeleteBy(base, pid, item, date, why?)`;
   - `itemLine` adds:
     - `· delete by 2026-12-31`;
     - `· EXPIRED <date> — not read by any job; its record and sha stay; the office's file is not touched (delete it by hand if the owner asked)`;
     - `· EXPIRED <date> — Sentinel's copies removed; its record and sha stay`, when `removed` is non-empty.
2. `src/setups/files-panel.ts`, per item, lead only: `<input type="date">` + "Set delete-by", and "Retire now", which asks `confirm("Retire <path> now? No job reads it again; its record and sha256 stay on the pack and the ledger. The office's own file is not deleted. This cannot be undone.")` and posts today's date. Expired items are greyed and have no Admit button.

**Tests**
- `bridge/evidence-logic.test.mjs`:
  - `readDeleteBy`: format, past date, 11 years ahead, a long `why`;
  - `due`;
  - `removable`: own photo → `[]`; own photo with `view_copy` → the copy only; `role:"context"` → path + copy;
  - `expire` keeps sha/provider/licence;
  - `validatePack` accepts expired, refuses `state:"gone"` and `delete_by:"31/12/2026"`;
  - `readAdmitBody` `.sentinel/x.jpg` → 400.
- `bridge/evidence-store.test.mjs` (every dep injected, a temp folder, clock injected):
  - (p) roles: machine 403 with the words, contributor 403, lead 200 with one row;
  - (q) today on an own scan: the item is expired, the `evidence:expired` row has `removed: []` and `office_file: "not touched …"`, **and the file still exists** (`existsSync`);
  - (r) a planted `.sentinel/view/ev-0001.jpg` with the matching sha is removed; one with other bytes is left;
  - (s) admitting an expired path → 409; recheck skips it;
  - (t) `startExpirySweep` with `every` injected runs over two project folders and skips a busy one;
  - (u) `.sentinel/` is not listed;
  - (h) passes with the 7-2 allow-list.
- `bridge/build-jobs.test.mjs`: `pickItems` refuses an expired scan with the words.
- `src/setups/evidence.test.ts`: the itemLine words.
- `bridge/write-roles.test.mjs`: delete-by with 4 people (viewer 403, contributor 403, lead 200, machine 403).

**Drill rows**
- **X-1.** The lead sets delete-by `2026-12-31` on photo ev-000A → row `evidence:delete_by ev-000A 2026-12-31`; the line reads "· delete by 2026-12-31".
- **X-2.** "Retire now" on `scans/tiny.las` (ev-000B) → rows `evidence:delete_by ev-000B <today>` and `evidence:expired ev-000B scans/tiny.las` with `removed: []`. **The file is still in the folder.** The line reads "EXPIRED <today> — not read by any job; … the office's file is not touched".
- **X-3.** A contributor's Set → 403; the machine credential → 403 `a delete-by date needs a person — it names who set it: sign in. Nothing was saved.`.
- **X-4.** A survey job lists ev-000B refused: `expired on <today> (delete-by) — not read`.

### 7-6 NOTICE (S; branch `feature/ma7-6-notice`)

**Bridge**
1. `bridge/evidence-logic.mjs` `noticeText({pack, version, rows, today})`. It is pure and deterministic: lines sorted, LF endings. The sha256 is of the text.
   ```
   NOTICE — <asset.name> (<project>) · evidence_pack@<version> · made by Sentinel <today>
   Every credit owed for the evidence and the tools this project's model was built from.

   Evidence from others
   - dataset · <attribution> · <licence> · <source_url>
   - ev-0003 drawing · from the <recipient_kind> under <req-id> · used with the holder's permission (not published)
   - ev-0009 model · <provider> · commercial licence · order <licence_ref>
   - ev-0012 photo · "<attribution_text>" · <author> · <licence> · <source_url> · retrieved <date>[ · drill: counsel has not reviewed web evidence][ · expired <date>]   (7-12)
   - <n> own item(s) · owner-supplied · no credit owed

   Tools and weights (from this project's build:run rows)
   - <name> <version> · <licence>
   - <name> <version> · <licence> (as the add-in reported)

   No image is embedded in the model (RVT or IFC). Images from others are kept blurred, for reference only, until their delete-by date.
   ```
   - The tools are the distinct `{name, version, licence}` over the `tools` of each `build:run` row. A row with `claimed: true` is listed with "(as the add-in reported)".
   - An empty section prints "(none yet)". Expired items stay credited.
2. `bridge/evidence-store.mjs` `noticeOf(key, packId, deps)`:
   - any member (as `readPack`);
   - `packOf`;
   - `d.auditAll(key, {entity_type: "build", action_prefix: "build:run "})` (the `recipe-store.mjs:164` form; injected);
   - a failed ledger read → 503 `the NOTICE needs the build:run rows and the ledger could not be read — nothing was made`;
   - returns `{text, sha256, pack_version, credits, tools}`. No row (it is a read).
3. `bridge/bcf-service.mjs`: `if (p3 && p4 === "notice" && !seg[5] && req.method === "GET") return send(res, 200, await ev.noticeOf(p1, p3));`.

**Web**
- `src/setups/evidence.ts`: `readNotice`; `noticeLine(r)` → `NOTICE saved · ${credits} credit(s) · ${tools} tool(s) · sha ${sha.slice(0, 12)}…`.
- `src/setups/files-panel.ts`: a "NOTICE" button for any member → `saveAs(new Blob([text], {type: "text/plain"}), \`${key}-NOTICE.txt\`)` (`src/setups/audit-pack.ts:28`).

**Tests**
- `bridge/evidence-logic.test.mjs`:
  - same input → same text and sha;
  - rows in another order → the same text;
  - dataset, drawing, vendor, own count and the closing line all appear;
  - tools de-duplicated;
  - a claimed row is marked;
  - empty sections say "(none yet)".
- `bridge/evidence-store.test.mjs` (w): a viewer reads it; a ledger failure → 503 with the words; the tools come from the injected rows.
- `src/setups/evidence.test.ts`: `noticeLine`.

**Drill rows**
- **N-1 (drill row 7, today's credits).** On `ma4c-drill`, the NOTICE lists `N own item(s)` and **every** distinct tool in the project's `build:run` rows (e.g. `sentinel-survey 0.6.0 · LicenseRef-Sentinel`, `python 3.14.x · PSF-2.0`, `numpy 2.4.6 · …`, `laspy 2.7.0 · BSD-2-Clause`, `lazrs 0.8.2 · MIT`, `laz (in lazrs) 0.12.2 · Apache-2.0`, `pye57 0.4.19 · MIT`, …). A scratchpad script counts the distinct tools in the ledger rows; the count equals the NOTICE's tool lines.
- **N-2.** On the MA-4h dataset drill project, the dataset line carries its attribution, `CC-BY-4.0` and the source URL. On `ma4c-drill`, each MA-8-3 vendor model has its order line.

**Batch 1 checks before merge**
- `cd WebApp && npx vitest run bridge src/setups`
- `node ../tools/licence-check/check.mjs` → exit 0, with the pending list
- `npx tsc --noEmit` → only the 17 known lib-target errors
- `C:\Python314\python.exe -B -m unittest discover -s survey -v` (unchanged; it proves nothing broke)
- No add-in file is touched, and the report says so. No `build:bridge-core`.

---

## 5. Risks and spikes (cheapest check first)

| # | Risk | Cheapest check | When |
|---|---|---|---|
| R1 | Python 3.14 has no Windows wheels for pycolmap/torch/gsplat | Download #0: PyPI / pytorch / gsplat index metadata (KB), with the founder's OK for the network call; D-7-20 | 7-15 step 0 |
| R2 | gsplat needs nvcc (absent) and an MSVC the CUDA version supports | Prebuilt wheel for the torch/CUDA pair first; CUDA Toolkit only on its own OK; Brush on the founder's word (D-7-25) | 7-15, T-0 |
| R3 | 8 GB VRAM too small to train | T-0 at half resolution, SH 0; `max_memory_allocated` | T-0 |
| R4 | Phone photos of plain walls do not register (< 18 of 20) | RG-0: registered count + reprojection px, blurred vs unblurred | RG-0 |
| R5 | No scan of a place the founder can photograph | Ask the founder at batch 2's close; tape-measured control points as the fallback (D-7-17) | before batch 5 |
| R6 | Spark's worker/wasm fails in the published opaque-origin iframe (never exercised; the `.3tz` loader is in no layout, map-viewer §2) | SP-0: synthetic PLY in the local app, then in the 1.0.89 publish | SP-0 |
| R7 | Pack cap 100 (whole-pack rewrite, `evidence-logic.mjs:38-41`) | Count before batch 5; registration/E57 on their own scratch project (D-7-26) | batch 5 |
| R8 | The EXIF rule refuses genuine own photos stripped by messaging apps | The words name the fix (the camera's original); count refusals in the drill; *change if* → a lead's per-item override (h) | SV rows |
| R9 | The item whitelist rejects a stored pack, so every evidence route returns 400 | Historical-shape replay test + G-3 GETs on 3 drill projects before the restart is announced | batch 1 |
| R10 | Most Commons photos are CC BY-SA, which is held | The drill picks 5 CC0/CC-BY photos; counsel Q2 | before CM-1 |
| R11 | Counsel never reviews | Switch default off; batch 7 is not built; rows owed (§7) | always |
| R12 | The sweep deletes the wrong file | `removable` never names an own file; `insideFolder` + delete only on a sha match; tests (q)(r) assert `existsSync` | 7-5 |
| R13 | qwen3.6 is slow (10-109 s/photo) or ignores `format` | M-0 timing; the strict parse refuses regardless (VR-2); one photo per job, 180 s | M-0, 7-8 |
| R14 | `ParseView` cannot be tested by massing-check where it lives | Move it into `MassingPlanner.cs` (synthesis correction 1) | 7-8 |
| R15 | Material substring collision (`concrete` in `concrete-block`) types the wrong wall | D-7-29 refusal + a unit test; drill values Concrete/Block | 7-9 |
| R16 | An EXIF thumbnail, XMP or ICC profile keeps the unblurred image or the location | B-2 byte scan + `test_blur.py` asserts no APP1/APP2/APP13 | 7-7 |
| R17 | The browser shows an EXIF-rotated photo, but the boxes land on the unrotated one | `ImageOps.exif_transpose` before boxes; a test with orientation 6; B-1 with a portrait photo | 7-7 |
| R18 | A decompression bomb / 200 MP image | `Image.MAX_IMAGE_PIXELS = 100_000_000` + a 64 MB original cap + a test | 7-7 |
| R19 | RED's substring rule fires on EXIF Make "Apple" and refuses every iPhone photo | RED reads only `provider`, never `capture`; a test with Make Apple admits | 7-4 |
| R20 | `evidence[]` on a desk decision breaks the add-in's decisions parse | System.Text.Json ignores an unknown property by default; read the C# DTO; a shared fixture case | 7-10 |
| R21 | COLMAP zip / pycolmap wheels bundle non-allowed parts (SiftGPU non-profit, Qt LGPL, CGAL GPL, FreeImage) | Read each bundle's licence folder at K row; pycolmap CPU first; `process:"separate"` only for LGPL | 7-15 |
| R22 | The torch wheel bundles the NVIDIA CUDA runtime (NVIDIA licence) | Read the wheel's licence files at the K row; a founder exception (D-7-16) | 7-15 |
| R23 | opencv-python bundles FFmpeg (LGPL, in process) | Not taken: YuNet runs on onnxruntime + numpy | 7-16 |
| R24 | A splat over the Funnel at ~7 MB/s | 256 MB cap, SH 0; SP-2 timing in the record; D-7-6 change path | 7-11, 7-19 |
| R25 | The Seagram photos keep feeding Photo Massing outside the pack until 7-14 | 7-14 in batch 4; counsel Q12; `CREDITS.md` travels with them | until batch 4 |
| R26 | Photo Massing stops filing if 7-14's bridge refusal merges before the add-in | D-7-27: merged only with the add-in deploy | batch 4 |
| R27 | Personal data on an append-only ledger (authors, faces) | Coordinates, faces and image bytes are never on rows or the pack (tests); author names: counsel Q16 | all |
| R28 | licence-check turns CI red on day one | Pending warns, does not fail; LC-1 run locally before the CI step merges | 7-1 |
| R29 | `huggingface_hub` / transformers try the network at load | `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` in the child env; the service's no-network rule (design 6.9) | 7-20 |

---

## 6. DOWNLOADS (each needs the founder's explicit OK, one item at a time)

**Batches 1-4 need no software download.**

Sizes are approximate. Each is re-read on the source page at the ask, and the K row records the real size. Every wheel goes to `%USERPROFILE%\SentinelData\wheels-ma7\` and is installed offline with `--require-hashes` into `%APPDATA%\Sentinel\photo-lib` (the MA-4g pattern). Nothing goes into the user site. Every accepted item gets its `tools/licence-check/allow.json` row in the same commit as its pinned requirements line.

**Default path: what MA-7 needs, in order**

| # | Item | Source | Licence (read before use) | ≈ Size | Slice |
|---|---|---|---|---|---|
| 0 | Index metadata only (no package bytes): `pypi.org/pypi/{pycolmap,gsplat,transformers}/json`, `download.pytorch.org/whl/cu126/torch/` listing, `docs.gsplat.studio/whl` listing | pypi.org, download.pytorch.org, docs.gsplat.studio | n/a | a few KB each | 7-15 (decides D-7-20) |
| 1 | YuNet `face_detection_yunet_2023mar.onnx` | github.com/opencv/opencv_zoo, `models/face_detection_yunet/` | MIT | 0.23 MB | 7-16 |
| 2 | pycolmap (CPU wheel, win_amd64, matching Python) | pypi.org/project/pycolmap | BSD-3-Clause + bundled libraries (read each: Ceres BSD-3, Eigen MPL-2.0, others) | 25-40 MB | 7-17 |
| 3 | PyTorch, CUDA 12.x Windows build, plus its deps: filelock (Unlicense), sympy, mpmath, networkx, jinja2, MarkupSafe, fsspec (BSD-3), typing_extensions (PSF-2.0) | download.pytorch.org/whl/cu126 (or the cu12x the gsplat wheel pairs with) | BSD-3-Clause; bundled NVIDIA CUDA runtime/cuDNN/cuBLAS under NVIDIA licences (R22) | 2.5-3.2 GB + ~30 MB deps | 7-19, 7-20 |
| 4 | gsplat (prebuilt wheel for that torch/CUDA pair) + jaxtyping (MIT), ninja (Apache-2.0), rich (MIT; markdown-it-py MIT, mdurl MIT, pygments BSD-2) | docs.gsplat.studio/whl (or pypi.org/project/gsplat) | Apache-2.0 | 10-40 MB | 7-19 (Sentinel's own trainer; the examples' requirements are **not** installed) |
| 5 | Grounding DINO tiny weights | huggingface.co/IDEA-Research/grounding-dino-tiny | Apache-2.0 | ~0.7 GB | 7-20 |
| 6 | SAM 2.1 hiera-small checkpoint | huggingface.co/facebook/sam2.1-hiera-small | Apache-2.0 | ~0.18 GB | 7-20 |
| 7 | transformers + tokenizers + safetensors + huggingface_hub (+ deps: requests Apache-2.0, tqdm MPL-2.0/MIT, pyyaml MIT, regex Apache-2.0, packaging Apache-2.0/BSD) | pypi.org | Apache-2.0 | ~25-35 MB | 7-20 (run offline, R29) |

**Only if a check says so (asked only then)**

| # | Item | Source | Licence | ≈ Size | When |
|---|---|---|---|---|---|
| 8 | Embeddable Python 3.12 (`python-3.12.x-embed-amd64.zip`) + pip | python.org/ftp/python/3.12.x/ | PSF-2.0 | ~11 MB | #0 shows no cp314 Windows wheel for #2-#4 (D-7-20) |
| 9 | NVIDIA CUDA Toolkit 12.x (nvcc) | developer.nvidia.com/cuda-downloads | NVIDIA EULA (build tool, not shipped) | ~3 GB download, ~6 GB installed | no prebuilt gsplat wheel (R2) |
| 10 | COLMAP Windows release zip (no-CUDA) | github.com/colmap/colmap/releases | BSD-3-Clause + bundled (R21) | 0.1-0.5 GB | pycolmap fails RG-0 |
| 11 | `map-anything-apache` weights + code | huggingface.co/facebook/map-anything-apache; github.com/facebookresearch/map-anything | Apache-2.0 (this checkpoint only, D6) | 2-5 GB | pycolmap and COLMAP both fail |
| 12 | Qwen3-VL 8B | ollama.com/library/qwen3-vl (`ollama pull qwen3-vl:8b`) | Apache-2.0 | ~6 GB | M-0 fails qwen3.6 and llava (D-7-7) |
| 13 | Brush | github.com/ArthurBrussee/brush/releases | Apache-2.0 (verify) | 30-80 MB | T-0 NO-GO and the founder accepts the row-8 rewording |
| 14 | TEASER++ source + CMake | github.com/MIT-SPARK/TEASER-plusplus (MIT); cmake.org (BSD-3-Clause) | MIT / BSD-3 | ~10 MB + ~35 MB + a build | RG-0 shows control points fail |
| 15 | A COPC sample file (for K-0) | copc.io sample data (licence per file) | per file | 10-100 MB | K-0 needs a COPC file and none is on the PC |
| 16 | Miniforge + PDAL env | conda-forge (github.com/conda-forge/miniforge) | BSD-3-Clause | ~90 MB + 0.6-1 GB env | K-0 shows laspy cannot read COPC **and** a product slice needs PDAL (none planned, D-7-24) |

**Not taken (listed so nothing is silent):**
- Open3D (no cp314 wheel expected; numpy covers ICP);
- opencv-python(-headless) (FFmpeg LGPL in process, R23);
- community ONNX conversions of DINO/SAM (repo licences vary, D-7-19);
- hloc/LightGlue (R2M only; not in the design's MA-7 list);
- Inria 3DGS, DUSt3R/MASt3R, VGGT non-commercial, YOLO plate models (banned, §6.10);
- a permissive plate detector (none identified; a spike task, no download until one is found).

**Data** (the founder's OK per file, or the founder does it):
- 5 Wikimedia Commons photos (CC0/PDM/CC-BY only) + their file pages saved as HTML: 2-8 MB + ~50 KB each (CM rows).
- An E57 with panoramas: the owner's scan preferred (D8); else a public sample with its licence and size read first (E5 rows).
- Not downloads: the founder's own photos (B, M-0, RG), the stand-in screenshots (Sentinel's own viewer), the synthetic PLY (generated), and qwen3.6, llava, Pillow, onnxruntime and Spark (installed).

---

## 7. COUNSEL: held behind the switch, and what is owed

**Behind `SENTINEL_WEB_EVIDENCE` (the founder's env; default `off`; `on` needs `SENTINEL_WEB_COUNSEL_REF`; `drill` labels everything "counsel has not reviewed web evidence"):**
- 7-12 Commons admission, (g), FoP refusal, licence list;
- 7-13 context web items;
- batch 7 in full (7-21 fetch seam, 7-22 footprints, 7-23 street-level, 7-24 AMBER discovery);
- 7-25 Claude web search, behind a **second** switch with allowed domains and a monthly cap (D5; default off, cap 0).
- **Claude never sets either switch.**

**Owed until counsel** (not run, or run only on the founder's drill switch):
- CM-1, CM-2, CM-3, CM-5;
- CX-1, CX-2;
- W-1 … W-8.

CM-4 and CM-6 run with the switch off.

**Not held** (own evidence; on regardless):
- RED refusals and the source form;
- attestations;
- camera-data check;
- blur;
- vision attributes;
- material typing;
- ghost confirmation;
- registration;
- splats;
- NOTICE;
- delete-by/retire;
- licence gate;
- the guards.

An answer from counsel that tightens any of these becomes a fix slice.

**Questions for counsel (the founder sends them):**
1. **Jurisdictions.** May a public web photo of a building be used as *context* for modelling it in JO (no FoP; Law 22/1992 protects architecture and plans), AE, SA, EG, GB? Is D-7-13's table right?
2. **Share-alike.** Does CC BY-SA imagery or ODbL footprints, used as context or an outline seed, make the office's model Adapted Material or a Derivative Database? (D-7-11 holds SA.)
3. **Retention.** Maximum keep periods per source (Flickr "reasonable periods", Commons, Mapillary); what may stay after expiry (hash, URL, licence, author).
4. **Mapillary.** Who in an office may accept its commercial terms; is (h)'s wording enough?
5. **robots/TDM.** Is honouring robots.txt plus TDM reservations enough, where UK s.29A covers non-commercial use only and Jordan has no exception?
6. **Own photos with bystanders.** Under Jordan's PDPL and GDPR, may unblurred originals stay in the office folder if every Sentinel copy is blurred (D-7-4)? Is a contributor seeing the original until the copy exists acceptable (D-7-5)?
7. **Person-marked blurring** as enough before a detector (D-7-3).
8. **Attestation texts** (a)-(f) and the new (g), (h): adequate as the basis for admission?
9. **NOTICE.** Is a per-project NOTICE file (and its wording) sufficient credit for CC-BY items used as context?
10. **Claude web search.** May leads (URL + title only) be kept; which domains; Brave-backed results are transient-storage only.
11. **Openverse** as discovery only: acceptable?
12. **The Seagram drill photos** (Commons, three CC BY-SA) already read by Photo Massing: any action beyond 7-14 and keeping `CREDITS.md` with them?
13. **Building footprints** (Microsoft, Overture) as outline seeds marked "assumed" in commercial deliverables.
14. **marker.js 3 Linkware:** is an in-app credit enough for a commercial product (D-7-16)?
15. **Vision model licences:** confirm Apache-2.0 for qwen3.6 and llava as Ollama ships them; the Llama 3.2 Community licence refused.
16. **Personal data on an append-only ledger:** photo authors' names (licence credit) on rows that cannot be erased. Should they go in the pack only, or on rows too?
17. **Any RED additions** (other map services).

**Never automated, whatever counsel says** [R2M 4.3]: click-through terms, municipal portals, scraping search results, un-blurring, ML training on evidence (`ml_training:false`), keeping Brave results, web searches for drawings.

---

## 8. REVIT: rows that need Revit (none can run today)

| Row | What | Batch | Needs |
|---|---|---|---|
| PT-R | Apply the PT-2 changeset in Revit 2024: the wall is placed as `BDS_EXT_STR_CONC_200 mm`, not pre-ticked; `changeset_applied` names ev-000C in its evidence; one Undo | 2 (owed) | Revit 2024, scratch model, `ma4c-drill` |
| MV-R | Photo Massing (add-in with 7-8's change deployed) with a stub reply holding `height_m`: the review window shows the row error "the model offered height_m - counts and ratios only (the schema); this photo was not read"; a normal run is unchanged on the F46 photos | 2 (owed) | Add-in deploy 2021-2027 (every Revit closed, the founder's "deploy") |
| PM-2 | Photo Massing (7-14) lists only the pack's admitted, blurred photos, reads their copies, and its receipt names each item id and copy sha | 4 | Add-in deploy; Revit 2024 |
| PM-3 | Photo Massing with a photo that has no blurred copy: "ev-NNNN has no blurred copy — blur it in Files ▸ Evidence; not read" | 4 | Revit 2024 |
| R-3 | After PT-R: the model holds no image, splat or photo import (`texture_embed` false; "imagery never embedded in RVT or IFC") | 4 | Revit 2024 |
| OD-R | A detector-confirmed opening ghost is placed in Revit 2024 | 6 (owed) | Revit 2024 |
| D14 | One Revit 2026 or 2027 row per phase once the batch passes on 2024 (PT-R on 2026) | 4 | Revit 2026/2027 |
| Deploys | Add-in 2021-2027 for 7-8 (batch 2) and 7-14 (batch 4), with every Revit closed first, never the founder's unsaved work | 2, 4 | the founder's "deploy" |

**These need no Revit:**
- every row of batches 1, 3, 5, 6 and 7;
- in batch 2: B, M-0, VR, MV-1, PT-1..3 and PC;
- in batch 4: PM-1 (bridge, machine).
- The add-in compiles for 2021/2024/2025/2027 with `-p:DeployToRevit=false`, and `tools/massing-check` runs.

MA-7 adds no Revit command. The add-in files it touches are `MassingVisionReader.cs` and `MassingPlanner.cs` (7-8), Photo Massing's folder source and receipt (7-14), and `tools/massing-check`.

---

## Amendments (BINDING — critic, 2026-10-13; they override the text above where they differ)

Read for this pass, in the repo at b43816d:
- `WebApp/bridge/`: `evidence-logic.mjs` (all 342 lines), `evidence-store.mjs` (all 346), `bcf-service.mjs` (:470-560 and :1665-1700), `changesets-logic.mjs` (:56-84, :420-470), `changesets-typing.mjs` (:60-106), `survey-plan.mjs` (:255-315), `build-jobs.mjs` (:120-200), `changesets-store.mjs` (filed/stillAdmitted/overlay), `holding-logic.mjs` (:66-90), `cde-store.mjs` (:1205-1225), `ai-gateway.mjs` (:1-125), `request-limits.mjs` (:160-166), `mcp-server.mjs` (:338-345);
- `WebApp/src/sentinel-core/guideline.ts:205-225`, `WebApp/src/setups/{evidence.ts,files-panel.ts,bridge-fetch.ts,audit-pack.ts}` (the cited lines);
- `SentinelAddin/GhostBuilder/{MassingVisionReader.cs,MassingPlanner.cs}`, `SentinelAddin/Commands.GhostBuilder.cs:370-410`, `SentinelAddin/Engine/SettingsManager.cs:43-56`, `tools/massing-check/massing-check.csproj`, `.github/workflows/ci.yml`, `WebApp/db/migrations/*.sql`, `survey/{service.py,las.py,requirements-ma4g.txt}`;
- `WebApp/package-lock.json`, `node_modules/{xmlhttprequest-ssl,duck,fast-sha256,@markerjs/markerjs3}/package.json`, every `*.csproj` PackageReference, and the user site under `%APPDATA%\Python\Python314\site-packages`.

**Verified and correct (no change):**
- `bridgeImage` (`bridge-fetch.ts:142`), `saveAs` (`audit-pack.ts:28`), the stream (`bcf-service.mjs:1242`), `ADDIN_SOURCES` (`changesets-logic.mjs:70`), `sourceOf` (`:457`), the MCP `photo`→`agent` swap (`mcp-server.mjs:342`).
- The typer's substring match on `when.params` (`guideline.ts:214-219`).
- massing-check compiles `MassingPlanner.cs` only. `ViewReading` already lives in `MassingPlanner.cs:28`.
- Photo Massing creates only `level` and `mass` (`MassingPlanner.cs:383,415`), so 7-3's `photoKindRefusal` does not break it.
- `RESERVED_ACTIONS`/`RESERVED_TYPES` (`cde-store.mjs:1214-1215`).
- No migration constrains artefact kinds or audit actions (only `0029` checks `projects.kind`), so "no migration" holds.
- Pillow 12.3.0, onnxruntime 1.26.0, pillow_heif 1.7.0 and numpy 2.4.6 are in the user site.
- The lockfile has 213 entries with the tallies the plan gives.
- NuGet is exactly PdfPig, ProtectedData, System.Text.Json and the two Nice3point packages.
- The survey pins are laspy/lazrs/pye57/pyquaternion.
- The evidence-store test letters used today run (a)-(o), so (p)-(w) are free.
- `fromThisPc` exists (`request-limits.mjs:162`).
- CI has no Python job, so `survey/blur.py`'s test never runs on the runner.

---

1. **The unblurred original never crosses the Funnel (D-7-5).**
   Plan text: "**D-7-5 Who sees an original:** a signed-in contributor+, only while no copy exists, with `Cache-Control: no-store`. A wrong blur is fixed by retire (7-5) + re-admit under a new name."
   Replace with: "**D-7-5 Who sees an original:** a signed-in contributor+ **on this PC only**. `GET …/items/:id/original` answers only when `fromThisPc(req)` (`bridge/request-limits.mjs:162`, the PR-1 rule: a loopback socket with no `x-forwarded-for`). Otherwise it answers 403 `the unblurred original is shown on the office PC only (the local app) — mark faces and number plates there; nothing was shown`. It also answers only while no copy exists, with `Cache-Control: no-store`, and never to the machine credential. So box marking (7-7, 7-12) happens in the local app on the office PC, and the published app shows blurred copies only (design :424 "blurred on ingest"; D11 the office disk). A wrong blur is fixed by retire (7-5) and re-admission under a new name. *Change if:* counsel (Q6) and the founder allow remote marking."
   Add drill row **B-6** to batch 2: "From the published app over the Funnel, `GET …/ev-000D/original` (no copy yet) → 403 with the words above; from the local app → 200 image/jpeg."

2. **An uploaded splat cannot be blurred, so it is not admitted on (a)(c)(d) alone (7-11).**
   Plan text: "New evidence kind `splat`: format `ply` (3DGS header check), cap 256 MB, needs (a)(c)(d)."
   Replace with: "New evidence kind `splat`: format `ply` (3DGS header check, read through `readHead(full, 4096)`), cap 256 MB, provider own only (the RED rule applies), needs (a)(c)(d). A splat cannot be blurred after it is trained. An uploaded splat is therefore admitted only with the admitting person's explicit answer `no_people_or_plates: true` ("No faces or number plates are visible in this splat"), stored on the item and its row like `none_seen`. Without that answer it is refused: `a splat cannot be blurred after it is trained — train it in Sentinel from blurred photos (7-19), or confirm that no face or number plate is visible in it; nothing was saved`. A splat made by 7-19 carries the bridge-stamped `made_with` and needs no answer. Both new item fields join `ITEM_FIELDS` in 7-11's commit."
   Add drill row **SP-1b**: "the synthetic PLY with no answer → refused with the words; with the answer → admitted, `no_people_or_plates: true` on the row."

3. **7-12 must change four existing checks, which the plan does not name.**
   Plan text: "`role:"context"`, `geometry_extraction:false`, attestations (a)(d)(g)." (7-12) and "A web photo needs (a)(d)(g); (c) is for own capture only. Attestations go to at most 7." (D-7-10).
   Add after them: "The touchpoints, all in 7-12's commit:
   - (i) `needsOf` (`evidence-logic.mjs:25`) returns `["a","d","g"]` for `kind === "photo"` with `provider !== "own"` and no dataset.
   - (ii) `validatePack` gets an item branch before the own-item `else` (`:330`). For `x.role === "context"`:
     - `provider` is an AMBER/GREEN `SOURCES` id whose `kinds` include evidence;
     - `licence` is one of that source's licences;
     - `web` holds exactly the fields D-7-11 and amendment 5 name;
     - `allowed_uses.geometry_extraction === false` and `view_reference === true`;
     - `request_id`/`licence_ref` are absent.
     Today that `else` throws "is own (licence owner-supplied)" for every web item.
   - (iii) The attestation checks: `p.attestations.length > 6` becomes `> 8`, the words become "a to h, once each", and `ATTESTATIONS` gains `g` (and `h` with 7-23). (g) and (h) are never on a dataset pack.
   - (iv) `signAttestation`'s 400 words list the new codes. The web's `ATTESTATION_CODES`/`ATTESTATION_TEXTS` (`src/setups/evidence.ts:9-18`) gain `g`. The sha pin in `evidence.test.ts` and in `evidence-logic.test.mjs` gains (g)'s hash."

4. **(g) is counsel-dependent text, and an attestation is append-only.**
   Plan text: "sign (g) = lead;" (D-7-28).
   Replace with: "sign (g) = lead, and only while `webSwitch().mode` is `drill` (on the drill project, amendment 8) or `on`. With the switch off it is 409 `(g) speaks for web photos — web evidence is off until counsel has reviewed it; nothing was signed`. In drill mode the `attestation:signed` row carries `web_mode:"drill"`. If counsel rewords (g), the new text becomes a new code, so a (g) signed in the drill is never reused for production."

5. **Photo authors' names stay off the append-only ledger (the MA-4b precedent).**
   Plan text (CM-1): "each `evidence:admitted` value carries licence, `web {source_url, author, attribution_text, retrieved_at, terms_sha256, freedom_of_panorama:"yes", delete_by, web_mode}`, `role:"context"`, attestation ids (a)(d)(g)".
   Replace with: "each `evidence:admitted` value carries `licence` and `web {source_url, retrieved_at, terms_sha256, freedom_of_panorama:"yes", delete_by, web_mode, attribution_sha256}`, plus `role:"context"` and attestation ids (a)(d)(g). `author` and `attribution_text` stay in the pack (and so in the NOTICE) and never go on a row. This is the precedent at `evidence-logic.mjs:229-230` ("the recipient's name is not put on the append-only ledger (it stays in the pack)"); Q16 may later allow it. CM-2 checks that no row holds `author` or `attribution_text`."

6. **Freedom-of-panorama table: list only what has a statute behind it (D-7-13).**
   Plan text: "  - yes: GB, US, DE, SA;"
   Replace with: "  - yes: GB (CDPA s.62), US (17 USC §120(a), buildings), DE (§59 UrhG, views from public ground). Each yes carries its statute in the table, and the words name it;"
   Also replace "  - no: JO, AE, EG, FR, IT;" with "  - no: JO, FR, IT; every other code, SA, AE and EG included, is unknown." Unknown is refused as before. A code is two upper-case letters (ISO 3166-1 alpha-2); a free-text jurisdiction such as "Jordan" is unknown.

7. **There is no route that sets `asset.jurisdiction` on an existing pack.**
   `asset` is written once by `newPack` (`evidence-logic.mjs:159-163`), and the evidence block (`bcf-service.mjs:1677-1690`) has no update route.
   Plan text: "The pack's `asset.jurisdiction` is set to `GB` by the lead."
   Replace with: "The CM and CX rows run on a new office project, **`ma7-web-drill`**. Its pack is made by a lead with `POST /cde/ma7-web-drill/evidence {asset: {name, jurisdiction: "GB"}}`, and the founder's go is asked for the new project. `ma4c-drill` never holds a web item, since packs and their versions are never deleted. No asset-edit route is added in MA-7 (a pack's jurisdiction is fixed at creation; *change if* the founder asks, as a lead route with an `evidence:asset` row)."
   Every CM/CX row that names `ma4c-drill` or "the pack" means `ma7-web-drill`.

8. **Drill mode is scoped to the projects the founder names.**
   Plan text (D-7-9): "`drill` labels every item, row and NOTICE line "counsel has not reviewed web evidence";"
   Replace with: "`drill:<key>[,<key>]` (for example `SENTINEL_WEB_EVIDENCE=drill:ma7-web-drill`) turns web evidence on **for those projects only**, and every other project reads `off`. A bare `drill` reads off, with the words `drill mode names its project(s): SENTINEL_WEB_EVIDENCE=drill:<project key> — web evidence stays off; nothing was saved`. Drill mode labels every item, row and NOTICE line "counsel has not reviewed web evidence"."
   `webSwitch(env, key)` takes the project key. The 7-2 tests gain these cases:
   - `drill:ma7-web-drill` on `ma7-web-drill` → drill;
   - the same value on `ma4c-drill` → off;
   - bare `drill` → off with the words.

9. **The switch is read at bridge start, not per call.**
   `bcf-service.mjs:31` merges `config/.env` into `process.env` once at start, and `ai-gateway.mjs:82` reads `SENTINEL_AI_CLOUD` once at load.
   Plan text: "it is read per call (the `SENTINEL_AI_CLOUD` pattern), so no lead or owner can turn it on."
   Replace with: "it lives in `config/.env`, which the bridge merges into `process.env` at start (`bcf-service.mjs:31`). A change takes effect at the next bridge restart, and no lead, owner or route can change it. `webSwitch` reads `process.env` on each call (env injected in tests)."
   Add to batch 3 "The drill switch": "The founder edits `config/.env` both times (drill on, then off). Claude restarts the 4100 bridge after each edit, on the founder's word. The CM/CX rows then run on loopback with the local app, so no Funnel ask is needed for them. After the switch goes back off, CM-4 is re-run and gives the off words."

10. **An admission refused by the switch is a refused row, not a 403.**
    Plan text: "`webRefusal(pack, env)` → `{status: 403, words: OFF|ON_NO_REF}`, or `{status: 409, words: NO_A}` when (a) is not signed, or null. 7-12 and batch 7 call it first."
    Replace with: "`webRefusal(pack, env, key)` → `{status: 403, words: OFF|ON_NO_REF}`, or `{status: 409, words: NO_A}` when (a) is not signed, or null. It guards the routes that **search, fetch or sign (g)** (batch 7, amendment 4). An **admission** of a web photo while off goes through `policyRefusals` (7-4's branch) and becomes the usual `200 {verdict:"refused"}` with an `evidence:refused` row and a hold, as CM-4 expects. The two paths never mix."

11. **When the switch is off, web items that are already admitted are not shown or read, and drill items expire.**
    Add to 7-12: "While `webSwitch(env, key).mode === "off"`:
    - `GET …/items/:id/view` of a `role:"context"` item → 403 `web evidence is off until counsel has reviewed it — this web photo is kept, not shown; nothing was shown`;
    - the item is not offered by 7-9/7-10/7-13;
    - the NOTICE still credits it (credit outlives viewing).
    Every web item gets a delete-by date:
    - always ≤ today + its source's `max_keep_days`;
    - in drill mode, **forced to the drill day + 1**, so the sweep removes its copies the next day.
    The row CM-1 shows `delete_by` = tomorrow."
    Add drill row **CM-7**: "after the switch is back off: a context item's `…/view` → 403 with the words; the next day the sweep writes `evidence:expired` for each of the 5, `removed` lists their files."

12. **`classifyHost` cannot match a host plus path, and `upload.wikimedia.org` is shared.**
    Plan text: "| `ms-footprints` | github.com/microsoft/GlobalMLBuildingFootprints | ODbL-1.0 |" and "`wikimedia-commons`: commons.wikimedia.org, upload.wikimedia.org;"
    Replace with:
    - "Each `SOURCES` row holds `hosts` (host names only) and an optional `path_prefix`.
      - `ms-footprints`: `hosts: ["github.com"]`, `path_prefix: "/microsoft/GlobalMLBuildingFootprints"`. A bare `github.com` URL is **not** classified; as the plan wrote it, dot-suffix matching on `github.com` would turn every GitHub URL GREEN.
      - `wikimedia-commons`: `hosts: ["commons.wikimedia.org", "upload.wikimedia.org"]`. For `upload.wikimedia.org` it also needs `path_prefix: "/wikipedia/commons/"`, because `upload.wikimedia.org/wikipedia/en/…` holds English Wikipedia's non-free fair-use files.
      - `classifyHost` matches the host and then the prefix."
    - Tests gain:
      - `https://upload.wikimedia.org/wikipedia/en/a/ab/x.jpg` → null;
      - `https://github.com/someone/repo` → null;
      - `https://github.com/microsoft/GlobalMLBuildingFootprints/x` → GREEN `ms-footprints`.
    - CM-3 gains: "an `upload.wikimedia.org/wikipedia/en/…` URL → refused `that file is on English Wikipedia, not Wikimedia Commons — Commons files only (upload.wikimedia.org/wikipedia/commons/…); nothing was saved`."

13. **`pickItems` never lists photos, so CX-2 cannot happen as written.**
    `build-jobs.mjs:140` filters `x.kind === kind`, and a survey's kind is `scan`.
    Plan text (7-13 cell): "is refused by `pickItems`" and (CX-2): "**CX-2.** A survey job lists it refused with "context only (a web photo) — not read for geometry"; a ghost citation reads "context (assumed, web)"."
    Replace the cell text with "has `allowed_uses.geometry_extraction:false`, enforced by `validatePack` (amendment 3 ii), and is refused by the shared `usable()` (amendment 14) in every photo consumer". Replace CX-2 with:
    "**CX-2.** On `ma7-web-drill`:
    - (i) `GET …/evidence/evp-0001` shows the item with `geometry_extraction: false`;
    - (ii) "Ask the photo model" (7-8) on it → 409 `ev-00NN is a web photo — context only; it is not read by a model or used for geometry; nothing was read`;
    - (iii) a ghost citation reads "context (assumed, web)".
    `pickItems` keeps its `geometry_extraction` check (`build-jobs.mjs:147`) for 7-22's footprint items."

14. **One shared "usable" rule, and expiry reaches the existing job checks.**
    Plan text: "`bridge/build-jobs.mjs` `pickItems` (`:142`): a first reason `i.state === "expired" ? \`expired on ${i.expired_at.slice(0, 10)} (delete-by) — not read\``."
    Replace with: "Two parts.
    - (i) The `pickItems` reason as written.
    - (ii) `stillAdmitted` (`build-jobs.mjs:187-195`) gains `now.state === "expired" ? \`it expired on ${now.expired_at.slice(0, 10)} (delete-by)\``. It is the shared check behind propose, MA-4e verify, the scan overlay (`changesets-store.mjs:670-678`) and MA-8-13 recipes, so an expired scan is never read again by any of them.
    - Test: `stillAdmitted` on a row whose item is expired → 409 with the words.
    7-7 adds a pure `usable(item, use)` in `evidence-logic.mjs`, with `use` one of `view`, `read`, `type`, `cite`, `train` or `register`. It refuses (in words):
    - expired;
    - changed;
    - not a photo (for photo uses);
    - no `view_copy`;
    - `role:"context"` for `read`/`type`/`train`/`register`;
    - the switch off for a context `view`.
    Every MA-7 consumer calls it: the view route, 7-8, 7-9, 7-10, 7-14, 7-17, 7-19 and 7-20, each with a test."

15. **The expiry sweep must not run on a test bridge, and it records before it deletes.**
    The `admitting` lock is per process (`evidence-store.mjs:117-121`), and the SEC-8-style 4101 test bridges (VR-2, VR-4) share the evidence root and the database.
    Plan text: "3. `export function startExpirySweep({every = 6 * 3600_000, deps} = {})`."
    Add: "It starts only when `SENTINEL_EXPIRY_SWEEP` is not `off`. Every 4101 test-bridge recipe in MA-7 sets `SENTINEL_EXPIRY_SWEEP=off`, and the drill record says so. It is called from the `server.listen` callback (`bcf-service.mjs:541`), beside `startPlatformGatePoll`, with one log line `[bridge] evidence expiry sweep: on (every 6 h)` or `: off (SENTINEL_EXPIRY_SWEEP=off)`."
    Plan text (sweepRun): "Then one `fold` for all items, and one row per item".
    Replace the order with: "First one `fold` that marks each due item `expired`, with `removed` = the paths whose sha matched (planned). On a 409, nothing is deleted, the error is logged, and the next run retries. Then each planned path is unlinked. Then one row per item, whose value adds `not_removed: [{path, why}]` for any unlink that failed. The pack never says live while its bytes are gone."
    Test (r) gains: "a fold that throws 409 → `existsSync` of the copy is still true".

16. **X-2 must not retire a scan that earlier drills depend on.**
    Plan text: "**X-2.** "Retire now" on `scans/tiny.las` (ev-000B)".
    Replace with: "**X-2.** First admit a fresh copy, `scans/ma7-retire-test.las` (the `scratchpad/tiny.las` bytes, a scan with `registration.method` "registered in source"), as ev-000B. Then press "Retire now" on it. Never retire an item that an earlier drill's job, changeset or verify row names: ma4c-drill's MA-4c…MA-8 scans stay live." X-4 refers to that same item.

17. **The expired check goes before the "already admitted" 409.**
    Plan text: "5. `admitRun` (`:229`): `prev?.state === "expired"` → 409 …".
    Add: "This check is placed **before** `if (prev && prev.state !== "changed")` (`evidence-store.mjs:230`). Otherwise an expired path gets the misleading words "is already admitted … (Re-check finds a changed file)". A test asserts the expired words."

18. **When a web original is replaced by its copy, the item's sha must change with it.**
    Plan text: "It is blurred in the same step and **its file replaced by the copy** (`original_sha256` kept)."
    Replace with: "It is blurred in the same step and its file is replaced by the copy. The item's `sha256`/`size_bytes` are the **copy's**, and `original_sha256`/`original_size_bytes` are kept as record. `view_copy.sha256 === sha256`. Re-check then compares the file with the copy's sha and does not flag it. `removable()` deletes `path` on the copy's sha. Replacement writes to a temp name in the same folder, then renames, so no half-written file is left."
    Add to the 7-12 tests: "after admission, `recheckRun` reports 0 changed for the web item".

19. **`imageryRefusal` gives false positives as written.**
    Revit has a built-in type parameter named "Image", and a Comments or URL value may name a photo without carrying one. Element keys are already whitelisted (`ELEMENT_FIELDS`, `PLACE_KEPT`: an unknown key is not kept), so a key rule adds nothing.
    Plan text: the four "It refuses:" bullets (the key regex, `data:image/`, base64 magic, the file-name ending) and the tests "a facts param `Image: "a.jpg"` → 400; a `texture` key → 400;".
    Replace with:
    - "It refuses only bytes:
      - a string starting `data:image/`;
      - a string longer than 64 that starts `/9j/` or `iVBORw0KGgo`, or `UklGR` (WebP base64), or `AAAAIGZ0eXBoZWlj` (HEIC base64).
      `what` is "an image as text". `// ponytail: byte checks, not names — a name is not imagery, and ops carry no file field.`"
    - The tests become:
      - "a facts param `Image: "a.jpg"` → passes (a name, not an image);
      - a `Comments` set_parameter `to: "see IMG_0001.jpg"` → passes;
      - a `data:image/png;base64,…` → 400;
      - a 100-character `/9j/…` → 400".
    G-1 is unchanged.

20. **Add a Revit-free pin that the add-in has no image-import API.**
    Today `SentinelAddin` has 0 hits.
    Add to 7-3: "`tools/licence-check/check.mjs --imagery` (or a section of the same run) scans tracked `SentinelAddin/**/*.cs` for `/ImageType\.Create|ImageInstance\.Create|ImageTypeOptions|DecalType|AppearanceAssetElement|RenderingAsset|IfcImageTexture|IfcBlobTexture|IfcPixelTexture/`. Any hit fails with `IMAGERY <file>:<line> — imagery is never put into the model (design 4.4); nothing ships with it`."
    Add drill row **IMG-0**: "on master the scan prints `imagery: 0 hits` and exits 0; a scratch copy with `ImageType.Create(` added exits 1 naming the line." R-3 (Revit) stays the live proof.

21. **G-3 as written does not run `validatePack`.**
    A GET reads the stored body; `validatePack` runs only when the bridge writes (`foldArtefact`).
    Plan text: "**G-3 (replay).** Before the restart is announced, `GET …/evidence/evp-0001` on `ma4a-drill`, `ma4c-drill` and the MA-4h dataset drill project → 200 each, item counts unchanged."
    Replace with: "**G-3 (replay).** **Before 7-3 merges**, a scratchpad script runs:
    - it lists every folder under `evidenceRoot()` (each pack made one), aster-tower included, **read-only**;
    - it reads each project's pack through `GET /cde/<key>/evidence/evp-0001` with the machine credential on loopback;
    - it runs the branch's `validatePack` (imported from the branch checkout) on each `pack` body;
    - it prints `<key> evidence_pack@n · N items · valid` or the 400's words.
    Every pack must be valid before the merge. A failure is a finding and the whitelist widens: a stored pack is never rewritten to fit."

22. **`xmlhttprequest-ssl` is MIT, so the pending count is 10.**
    Its `node_modules/xmlhttprequest-ssl/package.json` has `licenses: [{type: "MIT"}]`, which `readNpm` reads.
    Plan text: "`pending`: `@markerjs/markerjs3`, `fast-sha256`, `duck`, `xmlhttprequest-ssl`", "`xmlhttprequest-ssl` (no lockfile field: read its package.json);" and LC-1's "`banned 0, unknown 0, pending 11`".
    Replace with:
    - `pending`: `@markerjs/markerjs3`, `fast-sha256`, `duck`;
    - D-7-16 drops the `xmlhttprequest-ssl` line (allowed: MIT from its package.json `licenses[]`);
    - LC-1 reads `banned 0, unknown 0, pending 10`: markerjs3, fast-sha256, duck, ISC ×5, the two Nice3point packages.
    Also: "`readNuget`/`readPython` read **tracked** files only (`git ls-files` under `--root`, falling back to the folder walk when git is absent), so an untracked folder (today `tools/ma3c/`) never makes LC-1 differ from LC-3's CI line."

23. **Model names, digests and the add-in twin of the weights table.**
    Plan text: "7. `modelRefusal(name, digest12)` → null, or:".
    Add:
    - "(i) A bare name is read as `<name>:latest` (the add-in's default `GhostVisionModel` is `"llava"`, `SettingsManager.cs:56`).
    - (ii) The digest is read from the local Ollama `GET /api/tags` (the same loopback URL rule, D-7-8) before the first call, compared on its first 12 hex digits, and not counted as a model call.
    - (iii) The add-in gets a pure C# twin, `ModelLicence.Refusal(name, digest12)`, inside `MassingPlanner.cs` (so massing-check compiles it). It is called by `MassingVisionReader` and `LocalVisionReader` before any image is sent. A refused model makes every photo's row say the words, and nothing is read.
    - (iv) `tools/licence-check/check.mjs` reads the C# table by regex and fails `WEIGHTS DRIFT <name>` when its rows differ from `WEIGHTS`.
    - (v) The CLI also lists every model name in `ai-gateway.mjs` `PROVIDERS.local.models` and the `SettingsManager.cs` defaults (`GhostModel` `qwen2.5:7b-instruct`, `GhostVisionModel` `llava`). A name with no `WEIGHTS` row is **pending** (warn, never fail).
    - D-7-16 gains: `llama3` in the chat picker (Meta Llama 3 Community licence: drop it from the picker or accept it) and `qwen2.5:7b-instruct` (read its licence; Apache-2.0 expected)."
    Tests:
    - `modelRefusal("llava", "8dd30f6b0cb1")` → null;
    - massing-check: `ModelLicence.Refusal("llama3.2-vision", …)` → the banned words.

24. **The add-in's parse refuses only dimension keys, and the change is replayed (MA-6 must not break).**
    Plan text: "Add-in: `ParseView` moves into `MassingPlanner.cs` and an extra key becomes a row error".
    Replace with: "Add-in: `ParseView` moves into `MassingPlanner.cs` (with `ViewReading`, already at `:28`). An extra key that names a length (`/(^|_)(m|mm|cm|ft|metres?|meters?|feet|inches|height|width|depth|length|size|area)($|_)/i`, `height_to_width` excepted) refuses the photo's row with the MV-1 words. Any other extra key is ignored as today. The schema string stays verbatim, since it is P-1's measured basis (`MassingVisionReader.cs:25`). The bridge reader (7-8), which is new, keeps the strict any-extra-key refusal."
    Add drill row **MV-2**: "massing-check replays every reading in `tools/massing-check/p1-views.json`, re-serialised with its five model keys only, through the moved `ParseView` → every one parses to the same storeys/view/ratio (MA-6 unchanged)."
    Add to the 7-8 deploy: "`.github/workflows/ci.yml` addin job (2026): `dotnet run --project tools/massing-check`, after it passes locally."

25. **The photo reader is a new reader kind; its jobs propose nothing and MCP stays read-only.**
    Plan text: "Then reader `photo-reader 0.1.0` in the job runner:".
    Add: "`build-jobs.mjs` gains `PHOTO = "photo-reader"`.
    - `pickItems`'s kind line (`:134`) maps it to `"photo"`. Today every unknown reader falls to `"scan"`.
    - Its items are filtered by `usable(i, "read")` (amendment 14).
    - `POST …/build/jobs/:id/propose` on a photo-reader job → 409 `a photo reading files nothing — it is advice: choose the material on the gap (Choose by photo); nothing was saved`.
    - `RECIPE_READERS` (`recipe-store.mjs:160`) has no photo-reader entry, so its 409 stands.
    - The MCP survey-jobs tool lists photo-reader jobs with the material answer only.
    - No byte tool is added: the MCP tool count pin (17, `mcp-server.test.mjs`) is unchanged.
    Tests:
    - `pickItems(pack, dir, PHOTO)` lists photos, not scans;
    - propose on a photo job → 409."

26. **M-0 decides the default model; it does not block 7-8 or 7-9, and it uses no pack items.**
    Plan text: "**GO** if one model is right on ≥ 9/12 and says "cannot tell" rather than wrong on the rest; else D-7-7's Qwen3-VL ask."
    Replace with: "**GO** if one model is right on ≥ 9/12 and says "cannot tell" rather than wrong on the rest. That model becomes the reader's default.
    - On NO-GO, 7-8/7-9 still build and merge (VR-2/3/4 use stubs; PT rows are a person's choice). "Ask the photo model" is hidden, with the line `no photo model has passed Sentinel's check yet (M-0) — choose the material yourself`, until a model passes. D-7-7's Qwen3-VL ask (§6 #12) goes to the founder.
    - M-0 runs `survey/blur.py` as a CLI on scratchpad copies of the 12 photos and calls the local Ollama from a scratchpad script. Nothing is admitted to a pack (pack cap, R7), and the copies are deleted at the spike's end.
    - If the founder has no 12 own wall photos, M-0 is owed and "Ask the photo model" stays hidden."

27. **7-14 does not close every photo path; it also refuses web photos and the cloud.**
    Plan text: "| Closes the Seagram path (§0), so no photo gate can be walked around |".
    Replace with: "Closes Photo Massing's free-folder path (§0). What remains, said in the plan and the record: Ghost Builder's `LocalVisionReader` still reads sketches/renders from `GhostSourceFolder` as text hints for layer mapping (`Commands.GhostBuilder.cs:381-388`). It never makes geometry, but an image placed there is read outside the pack. That path is owed as **7-28 (MA-7 Next): sketch hints read only from the pack's drawings**, and until then the 7-14 words name it."
    Add to the 7-14 slice:
    - "Photo Massing reads only items that pass `usable(i, "read")`, so a **web (context) photo is never read**: geometry from a web photo is excluded (design §4.4 role). The Seagram Commons photos (`demo/aster/README.md:31`, three CC BY-SA, held) can no longer feed Photo Massing.
    - PM-2/PM-3 use **the founder's own photos of a building** (owed if none).
    - The cloud path is refused for pack photos: `GhostCloudOptIn` true with a non-loopback URL → every row says `evidence photos are read by a model on this PC only — nothing was sent` (D-7-8), checked with `LocalOnly.ModelUrlRefusal` before any image is read.
    - MV-R (batch 2, before 7-14) still runs on the F46/Seagram photos, which are free-folder files."

28. **How 7-14's bridge refusal knows which photos were read, and the machine credential's read.**
    Plan text (PM-1): "a `source:"photo"` changeset naming an unadmitted photo sha → 409".
    Add:
    - "Photo Massing's mass element carries `evidence: [{id, sha256}]`: each item id and its **copy's** sha (`ELEMENT_FIELDS` already has `evidence`).
    - The bridge refuses a `source:"photo"` changeset when:
      - an `evidence` entry is not an item of the pack;
      - an entry fails `usable(i, "read")`;
      - its sha is not `view_copy.sha256`;
      - the `evidence` list is empty (the "unadmitted" case).
    - `GET …/items/:id/view` accepts the machine credential (a read; loopback only by PR-1). `…/original` and `…/view-copy` never accept it.
    - The C# DTO's mass element and its receipt write `evidence`, and the shared fixture `fixtures/changeset-ops/photo-massing-evidence.json` pins the shape on both sides."

29. **PT-2's re-proposal must send the same frame.**
    `changesets-store.mjs:378` returns 409 when a job is proposed again with a different frame.
    Plan text: "**PT-2 (drill row 2, desk).** The lead opens "Choose by photo" on that gap,".
    Add: "Choose by photo re-proposes job PT-1 with the **frame and levels of its first proposal**, which the web reads from that planner row. Only the gap walls are new (decision 19 skips the filed cids, `changesets-store.mjs:359-363`)."
    Add a test: "a materials re-proposal with the first frame → 201; with another frame → the existing 409 words".

30. **MA-8-13 recipes do not repeat a person's photo choice.**
    Add to 7-9: "The planner row of a proposal made with `materials` carries `materials: [{cid, item, copy_sha256, material, chosen_by}]`. A recipe run (`recipe-store.mjs`) from a job whose reviewed run used `materials` → 409 `a recipe does not repeat a person's choice by photo — run the job and choose by photo again; nothing was saved`. Test in `recipe-store.test.mjs`."

31. **NOTICE words claim only what Sentinel does.**
    Plan text: "No image is embedded in the model (RVT or IFC). Images from others are kept blurred, for reference only, until their delete-by date."
    Replace with: "Sentinel puts no image into the model (RVT or IFC). Images from others are kept blurred, for reference only, until their delete-by date." Sentinel cannot see what a person inserts in Revit.
    Add to `noticeText`: "a tool with no licence in its row prints `· licence not reported`, and N-1 counts it as a tool."
    Plan text (N-2): "On `ma4c-drill`, each MA-8-3 vendor model has its order line."
    Replace with: "On the project where MA-8-3's vendor model was admitted (read from the drill record; owed if none), each vendor model has its order line."

32. **Splats in the published app are feature-detected; there is no publish-then-spike loop.**
    Plan text (SP-0): "2. The same is tried in the published app after 1.0.89. 3. If Spark's worker/wasm fails in the opaque-origin iframe, 7-11 ships local-app only, and the words say so (D-7-25)."
    Replace with:
    - "2. 7-11's "Show in 3D" starts Spark with a 1-gaussian probe first. If the worker/wasm does not start within 5 s, the button says `splats show in the local app on this PC (this published view cannot start Spark's worker) — nothing was loaded`.
    - 3. After 1.0.89 is published, SP-2 is run in the published app. Either result is a pass of the words, and the record says which. D-7-25 stands."

33. **Pillow and onnxruntime: read what their wheels bundle.**
    Plan text (D-7-2): "pinned with `importlib.metadata.version("pillow") == "12.3.0"`".
    Add:
    - "Before 7-7 merges, read `pillow-12.3.0.dist-info/licenses/*` (or `LICENSE`, which lists the bundled libraries: FreeType, libjpeg-turbo, libpng, zlib, libtiff, libwebp, openjpeg, lcms2, xz, brotli, harfbuzz, …).
      - The `allow.json` pillow row gets `carries` with each library and licence.
      - `evidence:blurred.tools` lists Pillow and its `carries` (the INSIDE pattern, `survey/service.py:41`).
      - A GPL-only part in process is a NO-GO, and D-7-2's C# WPF fallback applies.
    - 7-16 does the same for onnxruntime's `ThirdPartyNotices.txt`.
    - `blur.py` imports Pillow with `pillow_heif` blocked (`sys.modules["pillow_heif"] = None`) **before** `import PIL`.
    - A test asserts that `"pillow_heif"` is not loaded after a blur."

34. **The photo service makes no network call (pycolmap).**
    Plan text: "It runs pycolmap SfM on the blurred copies;".
    Add: "with SIFT features and exhaustive or sequential matching only. No learned extractor or matcher is used, since those fetch weights at run time. `photo/service.py` sets `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and no proxy variables. Its test patches `socket.create_connection`/`socket.socket.connect` to raise on any non-loopback address and runs a 3-photo job: no call is made. RG-0's comparison run on unblurred originals reads scratchpad copies, which are deleted at the spike's end, and its numbers only are recorded."

35. **A detector never moves or resizes a ghost (7-20).**
    Plan text: "It never creates".
    Replace with: "It never creates, moves or resizes. A detection writes only the advice line, and no element field changes. A test plants a detection box 300 mm off the ghost opening: the opening's `place` and `facts` are byte-identical before and after, and the line reads `seen in ev-… (detector, advice)`. OD-1 adds: "the ghost's size and position are unchanged (the changeset JSON's sha is the same before and after the read)"."

36. **The founder is asked for downloads early, and only asked.**
    Plan text: "**Founder asks before merge:** D-7-16 (the pending licence list)."
    Add: "At batch 1's close the founder also gets the §6 list (items #0-#7, name, source, size, licence) **as an ask only**. Nothing is fetched before each item's own OK, so the OKs for #0 (index metadata) and #1 (YuNet) are in hand before batch 5 starts and do not stall it. If #0 shows no cp314 wheels, D-7-20's #8 is asked in the same message."

37. **Count the pack before batch 2, not batch 5.**
    Plan text (R7): "Count before batch 5; registration/E57 on their own scratch project (D-7-26)".
    Replace with: "Count `ma4c-drill`'s items before batch 1's drill (SV-4, X-2) and again before batch 2 (B, PT, PC add about 6). If more than 85 remain after batch 2's needs, batch 2's photos go on a scratch project `ma7-photo-drill` (an office project, the founder's go). Registration/E57 stay on their own scratch project (D-7-26). M-0 adds nothing (amendment 26)."

38. **Batch steps: merge order, reviews, the plan file, the budget.**
    Plan text: "1. Build every slice on its own branch `feature/ma7-N-name`; a spike goes on `spike/ma7-…`, is never merged and uses scratch copies only."
    Replace with:
    - "1. Build every slice on its own branch `feature/ma7-N-name`, **cut from master after the slice it depends on has merged**. Batch 1's order is 7-1 → 7-2 → 7-3 → 7-4 (needs 7-2's `webSwitch` and 7-3's `ITEM_FIELDS`) → 7-5 (needs 7-3) → 7-6. Batch 2 is 7-7 → 7-8 → 7-9 → 7-10. A spike goes on `spike/ma7-…`, is never merged and uses scratch copies only."
    After step 6 add:
    - "7. Post-merge review rounds and a final verification are run and recorded (the MA-8 batch-5 pattern).
    - 8. The weekly token budget is reported at each batch's close (feedback-weekly-token-budget).
    - 9. The approved plan is copied to `docs/superpowers/plans/2026-10-13-ma7-photos-web-evidence.md` with these amendments, in batch 1's first commit."

39. **Build maps for batches 2-6 are a deliverable, written before each batch.**
    Plan text: "## 4. Build maps for batch 1".
    Add after the section title: "Batches 2-6 get their own build map (file:line, tests, pins that move, words), **written and critic-passed before the batch's first branch**, in `scratchpad/ma7/plan-bN.md` (the PB5 format). No slice of batches 2-6 is built from the table rows alone. Batch 7's maps wait for counsel (D-7-1)."

40. **7-4 changes MA-4a behaviour, and the record says so.**
    Plan text (7-4): "4. `photoRefusal({format, camera})`:".
    Add: "This is a deliberate change to MA-4a: a **new** own photo that is PNG or has no camera EXIF was admitted before and is refused now. Photos admitted earlier are untouched; re-admission of a flagged photo is not re-checked. The batch-1 record states it, and the MA4a drill's photo rows are re-read: a re-run needs a camera JPEG. Until 1.0.87 is published, the published app's one-click Admit sends no provider (`own`), so the EXIF rule still applies there."

41. **`ITEM_FIELDS` widens slice by slice, as D-7-30 says.**
    Plan text: "The first 19 are what `newItem` (`:235-249`) and `flagged` (`:252`) write today; `capture` comes from 7-4 and the last four from 7-5."
    Replace with: "7-3 lists exactly the 19 fields that `newItem` (`:235-249`) and `flagged` (`:252`) write today. 7-4 adds `capture` in its commit; 7-5 adds `delete_by`, `delete_why`, `expired_at`, `removed`; 7-7 adds `view_copy`; 7-11 adds `made_with`, `no_people_or_plates`; 7-12 adds `role`, `web`, `original_sha256`, `original_size_bytes`; 7-17/7-18 add theirs. Each slice's test adds one stored shape with its field to the replay list."

42. **GREEN sources are share-alike too.**
    Plan text: "   - **GREEN** (all `held_for_counsel: true`):".
    Add after the table: "OSM, Overture's ODbL layers and Microsoft footprints (ODbL) and Mapillary/KartaView/Panoramax (CC-BY-SA-4.0) are share-alike, so D-7-11's SA hold covers them. 7-22 and 7-23 admit them only after counsel answers Q2 (and Q13 for footprints), even with the switch `on`. `SOURCES` rows carry `share_alike: true`, and a test asserts that every SA row is `held_for_counsel`."

43. **Claude web search also needs the cloud switch.**
    Plan text: "| 7-25 | **Claude web search (after counsel + D5).** A second switch with allowed domains and a monthly cap".
    Add: "; it also needs `SENTINEL_AI_CLOUD=1` (`ai-gateway.mjs:82`), since a search is a cloud call billed to the founder's key. With either switch off the words say which one, and nothing is searched."

44. **The new byte module gets its own offline pin.**
    Add to 7-7: "`bridge/photo-store.mjs` (D-7-6) gets test (x) in `bridge/photo-store.test.mjs`, the test-(h) pattern:
    - no `fetch(`, `uploadIfc`, `/cde/files` or `thatopen` in its source;
    - its imports are an allow-list;
    - bytes are served only by `pipeline(createReadStream(...), res)`, with no `Access-Control-Allow-Origin: *` (the F11 rule, `bcf-service.mjs:897-899`).
    `bridge/write-roles.test.mjs` gains `…/view`, `…/original`, `…/view-copy`, the materials propose, `splat` placement, `…/notice` and `…/web`, each with 4 people (viewer, contributor, lead, machine)."

45. **The licence step placement in CI.**
    Plan text: "**CI: `.github/workflows/ci.yml`**, `web` job, after `- run: npm run prepare` (working directory `WebApp`): `- run: node ../tools/licence-check/check.mjs`."
    Add: "It runs after `npm install --ignore-scripts` and after `rm -f .npmrc` (`ci.yml:41-43`), so the npm token is never in its environment. It reads `node_modules/*/package.json` only for entries whose lockfile licence is missing or an object."

---

**Count: 45 amendments.**
