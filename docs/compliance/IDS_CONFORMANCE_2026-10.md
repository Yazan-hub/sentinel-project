# IDS 1.0 conformance — Sentinel's IDS checker (2026-10-20)

**Status.** Measured on Sentinel's own 33-case suite and on one real model, each against IfcTester. **buildingSMART's
official IDS 1.0 test cases have not been run yet:** downloading them needs the founder's OK (below). Once they are on
disk, the same harness runs them with no other change. This page will then carry those numbers too, good or bad.
buildingSMART certifies no IDS checker, so this is self-published evidence. It is not a certificate.

**What was checked.** The judge is `WebApp/src/sentinel-core/ids.ts` (`validateElement`, `judgeModel`). `.ids` XML is
read by `ids-parse.ts`. The same code runs in the viewer's IDS panel and, built as `WebApp/bridge/sentinel-core.mjs`, on
the bridge. The headless run reads each IFC with the bridge's reader (`WebApp/bridge/ifc-extract.mjs`, web-ifc 0.0.77,
every `IfcObjectDefinition`). The independent referee is **IfcTester** (IfcOpenShell 0.9.0.post1, IDS 1.0 engine), in
the venv `%APPDATA%\Sentinel\ifctester-venv`. A verdict is one of three things:
- **right:** the verdict the case names.
- **wrong:** the opposite verdict.
- **not checked:** Sentinel names the part of the IDS it cannot judge. It is never counted as right.

## 1. Sentinel's mini suite: 33 cases, every label stamped by IfcTester

`tools/ids-conformance/mini/` uses the official layout (`<facet>/<pass|fail>-<name>.ids` + `.ifc`). The cases were
written with IfcOpenShell by `make_mini_suite.py`. The generator stops if IfcTester's verdict on any case differs from
the case's name, so the expected answers are IfcTester's, not Sentinel's. IfcTester: **33 of 33**.

| facet | cases | before (master `2c43cb12`) right / wrong | after right / wrong / not checked |
|---|---:|---|---|
| attribute | 8 | 4 / 4 | 8 / 0 / 0 |
| entity | 5 | 3 / 2 | 5 / 0 / 0 |
| ids (specification cardinality, applicability facets) | 4 | 1 / 3 | 4 / 0 / 0 |
| property | 6 | 3 / 3 | 6 / 0 / 0 |
| restriction | 6 | 3 / 3 | 6 / 0 / 0 |
| classification | 2 | 1 / 1 | 0 / 0 / 2 |
| material | 2 | 1 / 1 | 0 / 0 / 2 |
| **total** | **33** | **16 / 17** | **29 / 0 / 4** |

**Before**, 11 of the 17 wrong answers were **false passes**, the dangerous kind:
- a pattern found inside a longer value
- a text value differing only in case
- a value outside its enumeration, its bounds or its maximum length
- a property set name in another case
- a wrong dataType
- a required specification nothing matched
- a prohibited specification something matched
- missing classification and missing material (the facets were dropped silently)

The other 6 were false failures:
- a subtype taken as its parent class
- a class list that applied to every class
- a property in applicability that was ignored
- a Description that was never read
- a "shall not be X" that failed every value
- a number off by 1e-10

By value restriction (after): pattern 2/2, enumeration 3/3, bounds 2/2, length 2/2. By cardinality: facet prohibited
3/3, specification required 1/1, specification prohibited 1/1.

## 2. A real model: Aster Tower (Revit 2024, IFC2X3, imperial units, 799 objects and types)

`tools/ids-conformance/real/aster-probe.ids` has 14 specifications, one per rule worth testing on real data. They ran on
`AST_ASTR26_Aster Tower.ifc` (2026-09-26, 1 398 307 bytes). **11 of 14 agree exactly** (elements in scope, failing,
verdict):

| specification | Sentinel | IfcTester | |
|---|---|---|---|
| S1 wall names follow `Basic Wall:.*` | 196 / 0 / pass | 196 / 0 / pass | same |
| S2 IsExternal as IFCBOOLEAN | 196 / 0 / pass | 196 / 0 / pass | same |
| S3 external walls load-bearing (property in applicability) | 24 / 24 / fail | 24 / 24 / fail | same |
| S4 IFCWALL | 0 / 0 / pass | 196 / 0 / pass | **differs**: IfcTester takes an IFC2X3 occurrence's class from its type (IfcWallType → IFCWALL); Sentinel matches the class written |
| S5 doors carry FireRating | 56 / 42 / fail | 56 / 42 / fail | same |
| S6 window FireRating from a list | 112 / 0 / pass | 112 / 0 / pass | same |
| S7 window U-value ≤ 3.0 | 112 / 112 / fail | 112 / 112 / fail | same |
| S8 FLOOR slabs internal (predefinedType) | 14 / 0 / pass | 14 / 0 / pass | same |
| S9 storey names `L\d+` | 15 / 13 / fail | 15 / 13 / fail | same |
| S10 no proxies (prohibited specification) | 224 / 224 / fail | 224 / 0 / fail | same verdict; IfcTester counts no element as failing a prohibited specification, Sentinel names each one |
| S11 the model has spaces (required specification) | 0 / 0 / fail | 0 / 0 / fail | same |
| S12 door width 0.8–1.2 m | 56 / 56 / fail | 56 / 0 / pass | **differs, a Sentinel gap**: IDS values are SI. IfcTester converts the doors' 3 ft to 0.914 m. Sentinel compares 3.0 |
| S13 walls carry ObjectType | 196 / 0 / pass | 196 / 0 / pass | same |
| S14 storeys say AboveGround (a LOGICAL UNKNOWN) | 15 / 15 / fail | 15 / 15 / fail | same |

## 3. buildingSMART's official test cases: owed

The suite is `Documentation/testcases` in `github.com/buildingSMART/IDS` at tag **v1.0.0** (commit `1effec6f`, released
2024-06-03):
- 634 files, 647 KB, about 315 IFC + IDS pairs
- folders: attribute, classification, entity, ids, material, partof, property, restriction, tolerance
- licence: CC BY-ND 4.0, © buildingSMART International. Unchanged copies may be shared with credit, as the BCF-API
  schemas already are in `WebApp/bridge/fixtures/bcf-api-schemas/`.

Once the founder OKs the download, it goes to `tools/ids-conformance/official/` and the run is the rerun below.
`--baseline` writes `official-baseline.json`, and from then on CI fails if any official case Sentinel had right goes
wrong. Expected:
- many "not checked" answers (classification, material, partof, names given as patterns)
- wrong answers on the `invalid-` cases (Sentinel does not check an `.ids` against the XSD)
- wrong answers on unit and IFC2X3-type cases

## What Sentinel judges, and what it does not

| part of IDS 1.0 | Sentinel |
|---|---|
| entity (applicability or requirements) | the class written, never a subtype; a class list or pattern; predefinedType as one value, a USERDEFINED type read from ObjectType. **Not:** IFC2X3 class from the type (S4); predefinedType inherited from the type; predefinedType as a list or pattern |
| attribute | any direct attribute with a plain value (both readers). **Not:** compared when it references another entity or is a list |
| property | named set and property, case-sensitive; dataType against the value's IFC type (both readers carry it); single values and quantities. **Not:** set or property names as a pattern or list; enumerated, list, bounded and table property values; **SI unit conversion (S12)** |
| classification, material, partOf | **not read**: said as "not checked", never a pass |
| value restrictions | simpleValue (text exact, numbers within 1e-6 relative), enumeration, pattern on the whole value, bounds, length. **Not:** totalDigits, fractionDigits, whiteSpace (said); XSD-only regex syntax (`\i`, `\c`, class subtraction) runs as JavaScript regex |
| facet cardinality | required, optional, prohibited ("shall not be X" fails X only) |
| specification cardinality | prohibited everywhere; required on a whole model only (the viewer, a file judged on its own), never on a changeset or an intake's class subset |
| ifcVersion | not applied |
| the `.ids` file itself | read, not validated against the IDS 1.0 XSD |

**Which paths use these rules.**
- **Viewer IDS panel:** loading an `.ids` file applies all of the rules above to the loaded models. The panel lists what
  it could not check beside the result.
- **Installed IDS (`ids@n`, JSON) at intake, on changesets and through the propose API:** these keep Sentinel's own
  looser rules (text compared case-insensitively, a pattern found anywhere in the value). They judge elements only, and
  intake reads 13 classes.
- **The Revit DD check (`StageIds.Judge`, `LodState.cs`):** checks required properties of the IDS Sentinel makes from
  the LOD matrix. It never reads an `.ids` file, so the official cases cannot be put to it. `tools/promote-check` holds it
  equal to `validateElement` on `WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.

## Known gaps, most harmful first
1. Units (S12): every millimetre or feet model fails a numeric bound written in metres.
2. Classification and material facets are not read. Both are common in real IDS files.
3. partOf is not read.
4. Names given as patterns or lists (property set, property, attribute).
5. Properties other than single values: enumerated, list, bounded, table.
6. IFC2X3 class from the type (S4), and predefinedType inherited from the type.
7. ifcVersion is not applied, and the `.ids` file is not validated against the XSD.

## Rerun
```
%APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/ifctester_run.py <cases-dir> ift.json
node tools/ids-conformance/run.mjs <cases-dir> --ifctester ift.json [--baseline tools/ids-conformance/official-baseline.json]
%APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/ifctester_run.py <file.ids> <file.ifc> ift.json
node tools/ids-conformance/run.mjs <file.ids> <file.ifc> --ifctester ift.json
```
- `<cases-dir>` is `tools/ids-conformance/mini`, or the official folder.
- The mini suite runs in CI through `WebApp/bridge/ids-conformance.test.mjs` in under a second, with no network. It
  fails on any wrong verdict.
- The official half of that test skips while the cases are absent.
