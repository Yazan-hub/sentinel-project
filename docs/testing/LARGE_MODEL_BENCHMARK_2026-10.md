# Large-model benchmark — will Sentinel open a hospital? (2026-10-19)

**Short answer: yes, for a real 7-storey hospital in 7 discipline models (63,182 elements, 15.3 M triangles).**
Each model opens in 1–2 s (worst seen 4.8 s); the whole federation draws at ~40 fps on a laptop's
*integrated* graphics; a clash run over the whole hospital takes ~10 s. The first real limit we hit was not the
viewer but Sentinel's local service, which froze for up to 34 s while it processed a large upload — fixed and
measured below. What we have **not** proven: 100k+ elements (this set is 63k), a dedicated graphics card, and
models streamed in parts (still blocked upstream).

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

1. **63k elements, not 100k+.** This is a real hospital, but the 100k mark is not measured. Nothing here suggests a
   wall just above it — memory and load time grew roughly with model size — but that is an expectation, not a
   measurement.
2. **The viewer's next limit is draw calls.** ~1,800 draw calls per frame put a laptop's integrated GPU at ~40 fps
   (p95 50 ms while moving). Usable; not 60. The levers inside today's engine are coarser level-of-detail
   thresholds (fewer small items drawn) and hiding disciplines not being reviewed (each model has a Hide/Show
   toggle). Not changed now: 40 fps is not a problem a user would report, and the spec's rule is to change loading
   only when a model shows one. A dedicated GPU was not measured.
3. **No streaming yet.** Every model is loaded whole. That Open's `fragments-beta` 3.5.9 already contains
   streamed models (`settings.streaming`, an importer "streamed mode"), but its components-world mount draws
   streamed models in the renderer's **WebGPU** mode only, and Sentinel runs WebGL — still blocked. The beta
   packages are no longer visible on the public npm registry (404), so newer betas cannot be checked from here;
   the public `@thatopen/fragments` 3.4.8 (6 Oct) carries tile fixes only. Question stays with That Open.
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
   BIM Tools ▸ Performance ▸ Measure 10 s while orbiting, then Coordination ▸ Clash ▸ Run clash.
