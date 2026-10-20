# IDS 1.0 conformance — Sentinel's IDS checker (2026-10-20)

**Status.** Measured on buildingSMART's official IDS 1.0 test cases (v1.0.0, 313 cases), on Sentinel's own 33-case
suite, and on one real model. Every result has IfcTester beside it, and every result covers both of Sentinel's IFC
readers. buildingSMART certifies no IDS checker, so this is self-published evidence. It is not a certificate. The bad
numbers are here too.

**What was checked.** The judge is `WebApp/src/sentinel-core/ids.ts` (`validateElement`, `judgeModel`). `.ids` XML is
read by `ids-parse.ts`. The same code runs in the viewer's IDS panel and, built as `WebApp/bridge/sentinel-core.mjs`, on
the bridge. Each IFC is read twice, as each product path reads it:
- **viewer:** IFC → `.frag` through the bridge's converter, then the fragments engine. These are the getItemsData
  relations and the `parseElementProperties` the browser uses.
- **bridge:** intake's web-ifc reader (`ifc-extract.mjs`), every `IfcObjectDefinition`.

The referee is **IfcTester** (IfcOpenShell 0.9.0.post1, IDS 1.0 engine), in the venv
`%APPDATA%\Sentinel\ifctester-venv`.

**How a case is scored.**
- A case's name says its expected result:
  - `pass-`: the model passes.
  - `fail-`: it fails.
  - `invalid-`: the IDS breaks an IDS 1.0 rule (for example "invalid entities always fail"). A checker must not pass it,
    so *fail* or *refused* are both right.
- Sentinel's answer is one of three:
  - **right:** that verdict.
  - **wrong:** the opposite verdict.
  - **not checked:** Sentinel names the part of the IDS it cannot judge. It is never counted as right.

## 1. buildingSMART's official test cases: 313 cases

The suite is `tools/ids-conformance/official/`: `Documentation/testcases` of `github.com/buildingSMART/IDS` at tag
**v1.0.0** (commit `1effec6f`, 2024-06-03).
- 634 files, 647 279 bytes.
- CC BY-ND 4.0, © buildingSMART International.
- Kept unchanged, with `LICENSE` and `NOTICE.md`.
- 313 IDS + IFC pairs. Three `.ids` files in the release have no IFC. Thirty-two tolerance cases are named `pass_` /
  `fail_`, with an underscore.

| | right | wrong | not checked |
|---|---:|---:|---:|
| master before today (`2c43cb12`), bridge reader | 190 | **123** | 0 |
| now, viewer reader | **187** | **37** | 89 |
| now, bridge reader | 186 | 38 | 89 |
| IfcTester 0.9.0.post1 | 288 | 25 | — |

**Before:** Sentinel answered every case and was wrong on 39% of them. 56 of its 190 "right" answers were
classification, material and partOf cases it passed only because it dropped those facets without saying so.

**Now:** it is wrong on 17% of the cases it answers (37 of 224). The 89 "not checked" are exactly the classification
(27), material (28) and partOf (34) cases, each reported as not checked. The right count dropped by 3 because those
lucky passes are gone.

| facet | cases | viewer right / wrong / not checked | bridge right / wrong / not checked | IfcTester right |
|---|---:|---|---|---:|
| attribute | 56 | 39 / 17 / 0 | 38 / 18 / 0 | 54 |
| classification | 27 | 0 / 0 / 27 | 0 / 0 / 27 | 27 |
| entity | 24 | **24** / 0 / 0 | **24** / 0 / 0 | 24 |
| ids (specification cardinality) | 12 | **12** / 0 / 0 | **12** / 0 / 0 | 11 |
| material | 28 | 0 / 0 / 28 | 0 / 0 / 28 | 28 |
| partof | 34 | 0 / 0 / 34 | 0 / 0 / 34 | 34 |
| property | 74 | 60 / 14 / 0 | 60 / 14 / 0 | 72 |
| restriction | 22 | 17 / 5 / 0 | 17 / 5 / 0 | 22 |
| tolerance | 36 | **35** / 1 / 0 | **35** / 1 / 0 | 16 |

By value restriction (viewer):
- length 6 / 0 / 0
- enumeration 14 / 1 / 0
- bounds 11 / 5 / 0
- pattern 20 / 1 / 30 (the 30 not checked sit in the classification, material and partOf folders)

By cardinality: facet prohibited 2 / 0 / 4, facet optional 6 / 0 / 6, specification prohibited 3 / 0 / 0. Every
`entity/` and `ids/` case is right.

**Where Sentinel beats IfcTester 0.9.0.** Tolerance: 35 of 36 against 16. IfcTester 0.9.0 compares within 1e-6
relative only. The v1.0.0 cases need 1e-6 relative **plus** 1e-6 absolute, and on bounds an exclusive bound tightens by
that tolerance while an inclusive one loosens by it.

**What the 37 wrong cases are (viewer).**
- **22:** the IDS asks about IFC entities that are not building objects or types: IfcSurfaceStyleRefraction (12),
  IfcTaskTime (4), IfcTask (2), IfcSurfaceStyleRendering (2), IfcClassification (1), IfcStairFlight's NumberOfRisers
  (1). Sentinel's readers read objects and types, so the IDS finds nothing and a required specification fails.
- **9:** enumerated, list, bounded and table property values. That Open's fragments importer drops these values (the
  viewer reads them as empty). The bridge reader reads only single values.
- **2:** unit conversion. IDS values are SI. Sentinel compares in the file's own units.
- **2:** `invalid-integer_values_cannot_be_stored_with_decimal`. IfcTester passes them too.
- **1:** a predefined property set (IfcDoorPanelProperties).
- **1:** `tolerance/fail-…negative_high_number_lower_bound` differs from its pass twin by 1e-11. That is below what a
  double can hold near 10⁶, so the two are the same number to Sentinel, which reads it as a pass.

The bridge reader's 38 differ from these only by which entity kinds each reader holds: the fragments model also
carries IfcQuantityCount and one more resource, and the bridge reads IfcTask.

## 2. Sentinel's mini suite: 33 cases, every label stamped by IfcTester

`tools/ids-conformance/mini/` uses the same layout. The cases were written with IfcOpenShell by `make_mini_suite.py`,
which stops if IfcTester's verdict on any case differs from the case's name. IfcTester: 33 of 33.

| | right | wrong | not checked |
|---|---:|---:|---:|
| master before today (`2c43cb12`) | 16 | 17 (11 of them false passes) | 0 |
| now, viewer and bridge readers alike | 29 | **0** | 4 (classification, material) |

## 3. A real model: Aster Tower (Revit 2024, IFC2X3, imperial units, 799 objects and types)

`tools/ids-conformance/real/aster-probe.ids` has 14 specifications. They ran on `AST_ASTR26_Aster Tower.ifc`
(2026-09-26, 1 398 307 bytes). Both readers give identical counts, and **11 of 14 agree exactly with IfcTester**
(elements in scope, failing, verdict):
- S1, S2, S3, S5, S6, S7, S8, S9, S11, S13, S14 are the same:
  - names by pattern, dataType, a property in applicability, missing FireRating (42 of 56 doors), a value list
  - a U-value bound, predefinedType, storey names `L\d+`, a required specification with no spaces
  - ObjectType, a LOGICAL UNKNOWN as no value
- **S4 `IFCWALL` differs:** 0 in scope for Sentinel against 196 for IfcTester. In IFC2X3, IfcTester takes an
  occurrence's class from its type (IfcWallType → IFCWALL). Sentinel matches the class written.
- **S10 "no proxies" (prohibited) differs:** the verdict is the same (fail). IfcTester counts no element as failing a
  prohibited specification, while Sentinel names all 224.
- **S12 door width 0.8–1.2 m differs, a Sentinel gap:** IfcTester converts the doors' 3 ft to 0.914 m and passes them.
  Sentinel compares 3.0 and fails them.

## What Sentinel judges, and what it does not

| part of IDS 1.0 | Sentinel |
|---|---|
| entity (applicability or requirements) | the class written, upper case, never a subtype; a class list or pattern; predefinedType as one value, a list or a pattern, inherited from the type object, a USERDEFINED type named by ObjectType, ElementType or ProcessType. **Not:** IFC2X3 class from the type (S4) |
| attribute | any direct attribute with a plain value; a name given as a list or pattern; `""` fails even when optional. **Not:** attributes of entities that are not objects or types |
| property | case-sensitive set and property names, or lists and patterns of them; dataType against the value's IFC type; single values and quantities; the type object's sets, inherited. **Not:** enumerated, list, bounded and table values; predefined property sets; **SI unit conversion** |
| classification, material, partOf | **not read**: said as "not checked", never a pass |
| value restrictions | simpleValue (text exact, numbers within 1e-6 relative + 1e-6 absolute), enumeration, pattern on the whole value, bounds with the same tolerance, length. **Not:** totalDigits, fractionDigits, whiteSpace (said); XSD-only regex syntax (`\i`, `\c`, class subtraction) runs as JavaScript regex |
| facet cardinality | required, optional, prohibited ("shall not be X" fails X only) |
| specification cardinality | an unstated `minOccurs` is 1 (the XSD's default): required. Prohibited everywhere; required on a whole model only (the viewer, a file judged on its own), never on a changeset or an intake's class subset |
| ifcVersion | not applied |
| the `.ids` file itself | read, not validated against the IDS 1.0 XSD |

**Which paths use these rules.**
- **Viewer IDS panel:** loading an `.ids` file applies everything above to the loaded models, and lists beside the
  result what it could not check.
- **Installed IDS (`ids@n`, JSON) at intake, on changesets and through the propose API:** these keep Sentinel's own
  looser rules (text compared case-insensitively, a pattern found anywhere in the value). They judge elements only, and
  intake reads 13 classes.
- **The Revit DD check (`StageIds.Judge`, `LodState.cs`):** checks required properties of the IDS Sentinel makes from
  the LOD matrix. It never reads an `.ids` file, so the official cases cannot be put to it. `tools/promote-check` holds it
  equal to `validateElement` on `WebApp/bridge/fixtures/lod-matrix/ids-cases.json`, which is unchanged by this work.

## Known gaps, most harmful first
1. **Units:** official 2 cases, Aster S12. Every millimetre or feet model fails a numeric bound written in metres.
2. **Classification, material, partOf are not read:** 89 official cases, all said as "not checked". Classification and
   material are common in real IDS files.
3. **Multi-value properties:** enumerated, list, bounded and table (9). The viewer's gap is upstream, in That Open's
   fragments importer. The bridge reader could read them, but that isn't built.
4. **IDS about entities that are not objects or types:** tasks, styles, classifications as entities (22). That's outside
   what Sentinel reads.
5. **IFC2X3 class from the type** (S4).
6. **ifcVersion is not applied, and the `.ids` file is not validated against the XSD.**

## Rerun
```
%APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/ifctester_run.py <cases-dir> ift.json
node tools/ids-conformance/run.mjs <cases-dir> --ifctester ift.json [--baseline tools/ids-conformance/official-baseline.json]
%APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/ifctester_run.py <file.ids> <file.ifc> ift.json
node tools/ids-conformance/run.mjs <file.ids> <file.ifc> --ifctester ift.json
```
- `<cases-dir>` is `tools/ids-conformance/official` or `tools/ids-conformance/mini`.
- On this PC Windows long paths are off, so run IfcTester from the main checkout or a short copy. A worktree path plus
  the longest case name passes 260 characters. Node and git handle it.
- In CI, `WebApp/bridge/ids-conformance.test.mjs` runs both readers on both suites in about a minute, with no network:
  - The mini suite fails on any wrong verdict.
  - The official suite fails if any case in `official-baseline.json` (187 viewer, 186 bridge) stops being right.
- After a fix, rerun with `--baseline` to raise the bar.
