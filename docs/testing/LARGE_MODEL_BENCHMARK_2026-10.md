# Large-model benchmark — will Sentinel open a hospital? (2026-10-19, extended 2026-10-21)

**Short answer: yes, for a real 7-storey hospital in 7 discipline models (63,182 elements, 15.3 M triangles), and
for two of them side by side: 14 models, 126,364 elements, ~30 M triangles.** Each model opens in 0.5–2.4 s; the
126k federation draws at 33 fps while orbiting (p95 46 ms) on a laptop's *integrated* graphics, with the same
~2,000 draw calls per frame as the single hospital; a hard clash over all 14 models takes ~17–20 s
(was 31–36 s before the fix in §8). What we have **not** proven: a dedicated graphics card (set up and confirmed,
not yet measured — §7), one single building above 100k elements (the 126k set is the same hospital twice — §9),
and models streamed in parts (still blocked upstream).

## Test set

**West Riverside Hospital, IFC4 edition** — Autodesk's 7-storey hospital sample, courtesy of Autodesk Inc., from the
University of Auckland Open IFC Model Repository (model 308). Terms: provided "for the purpose of research and
other purposes as long as it carries the appropriate attribution to Autodesk Inc." Used here for testing only; the
files are not redistributed and are not in this repository.

| Discipline | IFC | Elements with geometry | Triangles (full tessellation) | .frag |
|---|---:|---:|---:|---:|
| Architecture | 77.2 MB | 14,409 | 4.92 M | 5.5 MB |
| Mechanical (HVAC) | 69.7 MB | 19,670 | 2.92 M | 3.5 MB |
| Sprinkler | 32.4 MB | 13,490 | 2.22 M | 1.7 MB |
| Plumbing | 22.7 MB | 9,121 | 4.53 M | 1.3 MB |
| Structural | 6.2 MB | 2,827 | 0.21 M | 0.7 MB |
| Electrical | 4.2 MB | 2,798 | 0.15 M | 0.3 MB |
| Fire alarm | 0.9 MB | 867 | 0.40 M | 0.1 MB |
| **Total** | **213 MB** | **63,182** | **15.3 M** | **13.1 MB** |

Element counts: web-ifc, every product that produces a mesh; the viewer's Performance readout reports the same
63,182. The .frag is the viewer's format: 16× smaller than the IFC on this set.

## Machine

Laptop, Windows 11 Home (build 26300) · Intel Core i9-13900HX (24 cores / 32 threads) · 32 GB RAM ·
Intel UHD Graphics (integrated) + NVIDIA RTX 4060 Laptop. **Chrome 155 rendered on the integrated Intel GPU** (its
choice on this hybrid laptop; changing it is a Windows graphics setting we did not touch) — so the viewer numbers
are a low-end-GPU result. Node 26.5 for the conversion. Sentinel web app 1.0.98 + this change, run as the local
app inside That Open Platform; engine `@thatopen-platform/components-beta` 3.5.18, `fragments-beta` 3.5.9, WebGL.

## Results

### 1. IFC → .frag conversion (the engine's IfcImporter, on this PC)

| Model | Convert | Peak memory | Upload end to end (Governed Intake) |
|---|---:|---:|---:|
| Architecture | 23.3 s | 884 MB | 91 s |
| Mechanical | 15.5 s | 691 MB | 71 s |
| Sprinkler | 7.8 s | 447 MB | 39 s |
| Plumbing | 10.1 s | 354 MB | 30 s |
| Structural | 2.2 s | 253 MB | 20 s |
| Electrical | 1.2 s | 204 MB | 14 s |
| Fire alarm | 1.0 s | 178 MB | 26 s |
| **All 7** | **61 s** | under 1 GB | **~5 min, one after another** |

"Upload end to end" is Sentinel's real path for an IFC from any source: checks, element extraction, conversion,
upload of the .frag and the IFC to the platform, ledger receipt, federation manifest.

### 2. Opening the models (Project Files ▸ Open 3D; the platform download + the engine opening it)

| Model | Open 3D |
|---|---:|
| Architecture | 1.9–2.0 s (download 0.7 s, open 1.2–1.3 s) |
| Mechanical | 1.8 s (one run 4.8 s) |
| Sprinkler | 1.4 s |
| Structural | 1.2 s |
| Plumbing | 1.1 s |
| Electrical | 0.9 s |
| Fire alarm | 0.6–0.8 s |
| **Whole hospital** | **~9 s of loading**, one model at a time |

The app now prints this time on every Open 3D (new in this change).

### 3. The whole hospital in the viewer (BIM Tools ▸ Performance, 10 s windows)

| | Orbiting and zooming | Standing still |
|---|---:|---:|
| Frame rate | 40 fps | 41 fps |
| Frame time p50 / p95 / worst | 20.9 / 50.0 / 146 ms | 25.0 / 29.2 / 58 ms |
| Draw calls per frame (avg / max) | 1,749 / 2,381 | 1,795 / 1,797 |
| Triangles drawn per frame (avg) | 1.42 M | 1.46 M |
| GPU memory | 925 geometries · 24 textures | same |
| JS heap | 530 MB (peak while orbiting) | 206 MB (settled) |

All 7 models follow the camera for culling and level of detail. Earlier small-model baseline (1 model, 378
elements, same GPU): 60 fps, p95 16.8 ms, 107 draw calls.

### 4. Clash detection (Coordination ▸ Clash, Hard, exact on the solids)

| Run | Elements in scope | Box overlaps | Confirmed on the solids | Time |
|---|---:|---:|---:|---:|
| Architecture × Mechanical | 25,186 | 10,079 | 2,437 (2,401 overlapping, 36 touching) | ~6–8 s |
| Whole hospital, all 7 models | 40,346 | 24,151 | 7,357 (6,540 overlapping, 817 touching) | ~10 s |

Times are read off the screen (±2 s). The high clash counts are the sample model's reality (services drawn through
walls), not a defect of the run.

### 5. Twice the hospital: 126k elements (2026-10-21)

No new download: the same 7 IFCs, plus a copy of each placed **200 m along the model's x axis** (every root placement
moved by 200 m in the file's own unit: millimetres, or feet for the sprinkler model) with **every GlobalId changed**, so
the copy is a second building with its own identities, not a duplicate. All 14 went through Governed Intake into a
scratch project `benchmark-hospital-x2`: the 7 originals in 4.6 min, the 7 copies in 4.3 min, all recorded and
published. In the viewer: **14 models · 126,364 elements with geometry** (126,970 in the Browser, which also counts
storeys and sites) · 2 × 15.3 M triangles. Two buildings 200 m apart, so they never clash with each other: the clash
count doubles exactly (§8).

Opening, one model at a time on the integrated GPU: **0.5–2.4 s per model** (Architecture 1.9–2.3 s, Mechanical
1.2–1.7 s, Fire alarm 0.5–0.7 s); the second hospital opened about as fast as the first with 7 models already open
(one outlier: Structural 2.4 s against 0.6 s). **~17 s of loading for all 14.** Memory with all 14 open: Chrome's process for the app **1.4 GB**, JS heap 253–263 MB after
garbage collection (612 MB peak while orbiting the 63k set), Chrome's shared GPU process 1.7 GB (all tabs).

### 6. The viewer at 126k (integrated GPU, the same session)

Intel UHD Graphics, Chrome 155, window 1707 × 898 at 150 % display scaling. Both hospitals framed in the view,
orbiting and zooming for the 10 s window (BIM Tools ▸ Performance):

| | 63k (7 models) | 126k (14 models), orbiting | 126k, standing still |
|---|---:|---:|---:|
| Frame rate | 47 fps | **33 fps** | 32 fps |
| Frame time p50 / p95 / worst | 20.8 / 41.6 / 100 ms | **29.0 / 45.7 / 304 ms** | 29.2 / 41.7 / 67 ms |
| Draw calls per frame (avg / max) | 2,068 / 2,571 | **1,935 / 2,338** | 1,928 / 1,930 |
| Triangles drawn per frame (avg) | 1.62 M | 1.61 M | 1.52 M |
| GPU memory | 980 geometries | 1,622 geometries | same |

**Culling and level of detail hold the work per frame flat**: twice the elements, the same ~2,000 draw calls and
~1.6 M triangles. The frame still costs ~40 % more (p50 21 → 29 ms), so the extra time is per model or per object,
not in what is drawn; whether that is the integrated GPU or the CPU is what the dedicated-GPU run (§7) will tell.
33 fps with a 46 ms p95 is smooth enough to coordinate in; it is not 60. The 304 ms worst frame was one hitch while
zooming. Measured in the founder's own Chrome while the test driver took screenshots between moves (same for both
sets).

### 7. A dedicated GPU: set up, not yet measured

Chrome picks the integrated GPU on this laptop, and changing that is a Windows graphics setting we do not touch.
Instead, a **separate Chrome instance with its own temporary profile and the command-line switch
`--force_high_performance_gpu`** renders on the RTX 4060: its chrome://gpu lists `GPU1 … NVIDIA GeForce RTX 4060
Laptop GPU … *ACTIVE*` and `GL_RENDERER: ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU … Direct3D11 …)`
(`--use-angle=d3d11` was not needed). The run itself is still owed: the app opens inside That Open Platform, and a
fresh profile needs one sign-in, which is the founder's to type. Until then, every viewer number here is the
low-end-GPU case.

### 8. Clash at scale: found and fixed

| Hard clash, all loaded models | 63k (7 models) | 126k (14 models) |
|---|---:|---:|
| Elements in scope | 40,346 | 80,692 |
| Box overlaps → confirmed on the solids | 24,157 → 7,358 (6,540 overlapping, 818 touching) | 48,308 → 14,715 (13,080 / 1,635) |
| Before (as shipped in web 1.0.106) | ~10–14 s | **31–36 s** (two runs) |
| After (this change) | **~11.5 s** | **~17–20 s** (two runs) |
| Of which: reading the boxes | 0.3 s | 0.3–0.7 s |
| comparing the boxes | 1.7 s (was 7.5 s) | 2.8–3.0 s |
| confirming on the solids (the engine's Collider) | 9.4 s | 14.1–15.7 s |

Times are from the press to the result (the app now prints each phase); the 63k phase split was taken with the
GlobalId change below already in, so its "before" compare is the old sweep alone. Doubling the scene took the run from
10–14 s to 31–36 s, and the phase split showed why: the **box compare** had a sweep whose start pointer could only skip a
contiguous run of elements, so the first long element (a slab or a main duct across the building) held it back and
every later element re-scanned everything after it. It now keeps a list of the elements still in reach and drops each
one as soon as it is passed: **same pairs, same order, 4.4× faster on the real hospital** (7.5 → 1.7 s), and the
126k run now grows no faster than its size. The copy finds one more touching pair than the original (7,358 vs 7,357):
float precision 200 m from the origin, not a lost clash. Also changed: the box phase asked the engine for every
attribute of every element just to read its GlobalId; it now asks for the GlobalId alone (the same ids, ~40× less
engine work). What remains is the engine's exact check on the solids (~80 % of the run), which is That Open's.

### 9. One building above 100k: not yet

The 126k set proves loading, memory, clash and the viewer with 126k elements in a 14-model federation. It is still
one hospital twice, so the second building is never on screen at the same detail as the first. A single denser
building would put more elements in view at full detail. No download is needed for that test: Revit 2024–2027 on
this PC ship Autodesk's own sample projects, **Snowdon Towers** (7 discipline models, ~320 MB of RVT in the 2024
edition) and **BIM_Projekt_Golden_Nugget** (architecture 141 MB + building services 93 MB). Their element counts are
not known until they are exported to IFC in a Revit session.

## What we fixed

**The local service froze during a large upload.** While the Architecture IFC (77 MB) went through Governed
Intake, Sentinel's local service answered nothing else for up to 34 s — a Revit user or a second browser would
have seen it hang. Cause: element extraction and IFC → .frag conversion ran on the service's only thread.
Both now run in a separate worker thread:

| On the 77 MB Architecture IFC | Before | After |
|---|---:|---:|
| Element extraction — longest freeze | 19.2 s | 0.1 s |
| IFC → .frag — longest freeze | 8.6 s | 0.1 s |

Same results, no slower (`bridge/ifc-worker.mjs`, tested in `ifc-worker.test.mjs`). Measured on this PC with the
same code outside the service; the service runs it since its restart on 2026-10-19 23:04.

Also: Open 3D now says how long a model took (download / open), and when the platform rate-limits downloads
(HTTP 429, seen while opening models quickly) it says "wait a minute" instead of blaming a missing version.

## Where the limits are (honest list)

1. **126k elements measured, as two copies of one hospital (§5–§9).** Loading, memory and clash grew with the size
   (clash only after the fix in §8). One single building above 100k elements is not yet measured (§9).
2. **The viewer's work per frame stays flat; its frame time does not.** ~2,000 draw calls and ~1.6 M triangles per
   frame at both 63k and 126k (culling and level of detail), but the integrated GPU went from ~41–47 to ~33 fps.
   Usable; not 60. Not changed now: no engine setting was shown to be the cause, and coarser level of detail would
   cut what is drawn, which is already flat. The levers today are hiding disciplines not being reviewed (each model
   has a Hide/Show toggle) and a dedicated GPU, whose run is set up but owed (§7).
3. **No streaming yet.** Every model is loaded whole. That Open's `fragments-beta` 3.5.9 already contains
   streamed models (`settings.streaming`, an importer "streamed mode"), but its components-world mount draws
   streamed models in the renderer's **WebGPU** mode only, and Sentinel runs WebGL — still blocked. Checked again
   2026-10-21: the public `@thatopen/fragments` 3.4.8, `@thatopen/components` 3.4.9 and `components-front` 3.4.5
   are unchanged since 9 Oct, and the `@thatopen-platform/*-beta` packages are still not on the public npm registry
   (404), so a newer beta cannot be checked from here. Question stays with That Open.
4. **Opening is one model at a time** (7 clicks, ~9 s of loading). The platform rate-limits rapid downloads (HTTP
   429); waiting a minute clears it.
5. **The sample set is not co-located across years.** The 2019 Architecture/Mechanical exports and the 2016
   Structural/MEP exports sit apart in space, so cross-year pairs do not clash. A data issue of the sample, noted
   so nobody reads it as a viewer fault.
6. **Upload is slower than conversion.** 91 s for the Architecture upload. Measured in isolation on this PC: the
   checks' element read 9–30 s, conversion 12–24 s, the federation manifest 0.9 s, the COBie measure 1.9 s and the
   wall read 3.8 s; the rest is the platform upload of the .frag and the 77 MB IFC and the database writes (not timed
   apart). The checks and COBie read the file separately, but mostly different classes (only doors and windows
   overlap): reading once would save about 1–2 s (~2%), so it was left as it is.
7. **Fixed after this run: the federation manifest now counts MEP.** It used to count architecture and structure only,
   so an MEP model's manifest read 0 elements and the Federation Gate never compared its services. It now takes every
   IfcDistributionElement (ducts, pipes, fittings, terminals, devices, controls): Mechanical 17,424, Sprinkler
   13,490, Plumbing 8,539, Electrical 1,673, Fire alarm 861 elements, at most 1.4 s per model. On this hospital the
   gate's verdict is unchanged (FAIL, from type-name drift that was already there); FG-01 now checks 57k elements for
   GlobalIds shared between models instead of 15k (still none), and FG-02 reports 15 drift findings instead of 10.
   Manifests captured before the change keep their old element list until the model is published again or its
   manifest is backfilled.

## How to repeat

1. Download the 7 IFC4 files of model 308 from openifcmodel.cs.auckland.ac.nz into a folder outside the repo.
2. Upload each through Governed Intake (`POST /cde/<project>/intake`) or Project Files ▸ Upload version.
3. In the local app: Project Files ▸ Open 3D on each file (the status line gives the load time), then
   BIM Tools ▸ Performance ▸ Measure 10 s while orbiting, then Coordination ▸ Clash ▸ Run clash. The browser
   console carries one `[Sentinel]` line per load, per measurement and per clash phase (boxes read / compared,
   solids).
4. For 126k: copy each IFC with every root `IFCLOCALPLACEMENT($,…)` made relative to one new 200 m translation and
   every GlobalId remapped (one character), upload the 14 files to a fresh project, and frame both buildings.
5. For a dedicated GPU on a hybrid laptop: start a second Chrome with
   `--user-data-dir=<a temporary folder> --force_high_performance_gpu`, check chrome://gpu, sign in once there.
