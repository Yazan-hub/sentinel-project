# IDS 1.0 conformance — Sentinel's IDS checker (2026-10-20)

**Status.** Measured on buildingSMART's official IDS 1.0 test cases (v1.0.0, 313 cases), on Sentinel's own 50-case
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
| master before 2026-10-20 (`2c43cb12`), bridge reader | 190 | **123** | 0 |
| IDS 1.0 rules (`43985656`), viewer reader | 187 | 37 | 89 |
| IDS 1.0 rules (`43985656`), bridge reader | 186 | 38 | 89 |
| + classification and material, viewer reader | **215** | **37** | 61 |
| + classification and material, bridge reader | 240 | 39 | 34 |
| + SI units, viewer reader | 217 | 35 | 61 |
| + SI units, bridge reader | 242 | 37 | 34 |
| + partOf, viewer reader | **244** | **35** | 34 |
| + partOf, bridge reader | **276** | **37** | 0 |
| IfcTester 0.9.0.post1 | 288 | 25 | — |

**Before:** Sentinel answered every case and was wrong on 39% of them. 56 of its 190 "right" answers were
classification, material and partOf cases it passed only because it dropped those facets without saying so.

**IDS 1.0 rules:** wrong on 17% of the cases it answered (37 of 224). The 89 "not checked" were exactly the
classification (27), material (28) and partOf (34) cases. The right count dropped by 3 because those lucky passes were
gone.

**+ classification and material:**
- **Bridge:** reads both and gets 54 of the 55 cases right. It is wrong on 14% of what it answers (39 of 279). The new
  wrong one is `pass-non_rooted_resources_that_have_external_classification_references_should_also_pass`: it asks
  about an IfcMaterial, and the bridge reader holds objects and types only.
- **Viewer:** reads materials (28 of 28). It still says "not checked" for all 27 classification cases, because That
  Open's fragments importer keeps no IfcClassificationReference: the element carries no association, and the reference is
  not an item. Wrong is unchanged at 37, which is 15% of the 252 it answers.
- **Both:** the 34 partOf cases are still "not checked".

**+ SI units:** both readers now get both official unit cases right (`property/…unit_conversions…`, a length in
millimetres against a value in metres). An IDS value is SI, so a value is converted before it is compared:
- from the property's or quantity's own unit, else the project's unit for its measure, as IfcTester does;
- for every named unit: length, area, volume, mass (to kilograms), angle, time and the rest;
- an IfcSIUnit by its prefix, an IfcConversionBasedUnit (feet) by its conversion factor;
- a derived unit (a U-value's W/m²K) and a temperature are compared as written, as IfcTester does.

The viewer reads prefixed SI units. That Open's fragments importer keeps an IfcConversionBasedUnit as an empty item, with
no type and no factor, so the viewer cannot convert feet. It says "not checked" for a specification that compares such a
value, and never compares feet as metres. No official case uses one. The mini suite and Aster Tower (S12) do.

**+ partOf:** the bridge now gets all 34 partOf cases right, and answers every one of the 313 cases. It reads all five
IDS relations as IfcTester does:
- aggregation and nesting, walked up through every level;
- containment, direct, else the container of the element's parent;
- the group;
- voids and fills (an opening's wall, or the wall of the opening a window fills);
- no relation: IfcTester's get_parent walk, falling back to a group.

The entity and predefined type are judged on the first ancestor of that class.

The viewer gets 27 right and says "not checked" for 7. That Open's fragments importer keeps aggregation, nesting and
containment, but no groups (the IfcGroup is not an item) and no voids or fills (Aster Tower's 168 come through as none).
So the viewer says "not checked" for:
- a group relation and the no-relation walk;
- voids and fills;
- an element found in no container that could still be in one through an opening it fills (1 official case). A space
  or a type fills nothing, so its "no container" is judged.

It is wrong on 14% of what it answers (35 of 279). The bridge is wrong on 12% (37 of 313).

| facet | cases | viewer right / wrong / not checked | bridge right / wrong / not checked | IfcTester right |
|---|---:|---|---|---:|
| attribute | 56 | 39 / 17 / 0 | 38 / 18 / 0 | 54 |
| classification | 27 | 0 / 0 / 27 | **26** / 1 / 0 | 27 |
| entity | 24 | **24** / 0 / 0 | **24** / 0 / 0 | 24 |
| ids (specification cardinality) | 12 | **12** / 0 / 0 | **12** / 0 / 0 | 11 |
| material | 28 | **28** / 0 / 0 | **28** / 0 / 0 | 28 |
| partof | 34 | **27** / 0 / 7 | **34** / 0 / 0 | 34 |
| property | 74 | 62 / 12 / 0 | 62 / 12 / 0 | 72 |
| restriction | 22 | 17 / 5 / 0 | 17 / 5 / 0 | 22 |
| tolerance | 36 | **35** / 1 / 0 | **35** / 1 / 0 | 16 |

By value restriction, viewer then bridge:
- length 6 / 0 / 0 and 6 / 0 / 0
- enumeration 14 / 1 / 0 and 14 / 1 / 0
- bounds 11 / 5 / 0 and 11 / 5 / 0
- pattern 29 / 1 / 21 and 48 / 3 / 0. The viewer's not-checked ones sit in the classification and partOf folders.

By cardinality, viewer then bridge:
- facet prohibited 4 / 0 / 2 and 6 / 0 / 0
- facet optional 9 / 0 / 3 and 12 / 0 / 0
- specification prohibited 3 / 0 / 0 and 3 / 0 / 0

Every `entity/` and `ids/` case is right.

**Where Sentinel beats IfcTester 0.9.0.** Tolerance: 35 of 36 against 16. IfcTester 0.9.0 compares within 1e-6
relative only. The v1.0.0 cases need 1e-6 relative **plus** 1e-6 absolute, and on bounds an exclusive bound tightens by
that tolerance while an inclusive one loosens by it.

**What the 35 wrong cases are (viewer).**
- **22:** the IDS asks about IFC entities that are not building objects or types: IfcSurfaceStyleRefraction (12),
  IfcTaskTime (4), IfcTask (2), IfcSurfaceStyleRendering (2), IfcClassification (1), IfcStairFlight's NumberOfRisers
  (1). Sentinel's readers read objects and types, so the IDS finds nothing and a required specification fails.
- **9:** enumerated, list, bounded and table property values. That Open's fragments importer drops these values (the
  viewer reads them as empty). The bridge reader reads only single values.
- **2:** `invalid-integer_values_cannot_be_stored_with_decimal`. IfcTester passes them too.
- **1:** a predefined property set (IfcDoorPanelProperties).
- **1:** `tolerance/fail-…negative_high_number_lower_bound` differs from its pass twin by 1e-11. That is below what a
  double can hold near 10⁶, so the two are the same number to Sentinel, which reads it as a pass.

The bridge reader's 37 differ from these by which entity kinds each reader holds: the fragments model also carries
IfcQuantityCount and one more resource, the bridge reads IfcTask, and the bridge is wrong on the classification of an
IfcMaterial (above), which the viewer says it cannot check.

## 2. Sentinel's mini suite: 50 cases, every label stamped by IfcTester

`tools/ids-conformance/mini/` uses the same layout. The cases were written with IfcOpenShell by `make_mini_suite.py`,
which stops if IfcTester's verdict on any case differs from the case's name. A case already on disk is not rewritten.
IfcTester: 50 of 50.

The 6 cases added with classification and material cover:
- a classification in applicability
- a type passing its classification down
- an occurrence overriding its type's classification per system
- IFC2X3's ItemReference
- a material layer-set usage, read as its set
- a type passing its material down

The 6 cases added with SI units cover:
- a length in millimetres against a bound in metres, passing and failing
- a length in feet
- a property's own unit over the project's
- an area quantity in square millimetres
- a mass in grams against a bound in kilograms

The 5 cases added with partOf cover:
- a window in a wall's opening, through voids and fills, passing and failing
- a beam in an assembly that is contained in a storey (containment through an aggregate)
- no relation, walking up to the building
- a prohibited aggregation

| | right | wrong | not checked |
|---|---:|---:|---:|
| master before 2026-10-20 (`2c43cb12`), 33 cases | 16 | 17 (11 of them false passes) | 0 |
| IDS 1.0 rules, 33 cases, viewer and bridge alike | 29 | **0** | 4 (classification, material) |
| + classification and material, 39 cases, viewer | 33 | **0** | 6 (classification) |
| + classification and material, 39 cases, bridge | 39 | **0** | 0 |
| + SI units, 45 cases, viewer | 38 | **0** | 7 (classification; the length in feet) |
| + SI units, 45 cases, bridge | 45 | **0** | 0 |
| + partOf, 50 cases, viewer | 40 | **0** | 10 (classification; groups, voids and fills; the length in feet) |
| + partOf, 50 cases, bridge | **50** | **0** | 0 |

## 3. A real model: Aster Tower (Revit 2024, IFC2X3, imperial units, 799 objects and types)

`tools/ids-conformance/real/aster-probe.ids` has 21 specifications. They ran on `AST_ASTR26_Aster Tower.ifc`
(2026-09-26, 1 398 307 bytes). The model has:
- 210 material layer-set usages and 3 material lists;
- Uniformat classification references on the wall types;
- 14 containments, and 168 doors and windows filling openings.

- **Bridge:** 19 of 21 agree exactly with IfcTester (elements in scope, failing, verdict).
- **Viewer:** 15 of 21 agree. It says "not checked" for S12 (a unit in feet), for S17 and S18 (classification) and for
  S20 (voids and fills).
- **Both readers:** S4 and S10 differ (below).

S1 to S14:
- S1, S2, S3, S5, S6, S7, S8, S9, S11, S13, S14 are the same:
  - names by pattern, dataType, a property in applicability, missing FireRating (42 of 56 doors), a value list
  - a U-value bound, predefinedType, storey names `L\d+`, a required specification with no spaces
  - ObjectType, a LOGICAL UNKNOWN as no value
- **S4 `IFCWALL` differs:** 0 in scope for Sentinel against 196 for IfcTester. In IFC2X3, IfcTester takes an
  occurrence's class from its type (IfcWallType → IFCWALL). Sentinel matches the class written.
- **S10 "no proxies" (prohibited) differs:** the verdict is the same (fail). IfcTester counts no element as failing a
  prohibited specification, while Sentinel names all 224.
- **S12 door width 0.8–1.2 m:** this used to differ: Sentinel compared 3.0 and failed every door.
  - Now the bridge converts the doors' 3 ft to 0.9144 m and gives 56 / 0 / pass, as IfcTester does.
  - The viewer says "not checked": the model's foot is an IfcConversionBasedUnit, which the fragments model does not
    carry.

S15 to S18, added with classification and material:
- **S15 walls carry a material:** 196 / 0 / pass for both readers and IfcTester.
- **S16 a Gypsum Wall Board layer:** 196 / 32 / fail for both readers and IfcTester, read through the layer-set usages.
- **S17 Uniformat, from the type:** the bridge and IfcTester give 196 / 0 / pass. The viewer says "not checked".
- **S18 Uniformat B2010:** the bridge and IfcTester give 196 / 164 / fail. The viewer says "not checked".

S19 to S21, added with partOf:
- **S19 walls are contained in a building storey:** 196 / 0 / pass for both readers and IfcTester.
- **S20 windows fill an opening in a wall:** the bridge and IfcTester give 112 / 0 / pass. The viewer says "not checked".
- **S21 storeys are part of a building:** 15 / 0 / pass for both readers and IfcTester.

## What Sentinel judges, and what it does not

| part of IDS 1.0 | Sentinel |
|---|---|
| entity (applicability or requirements) | the class written, upper case, never a subtype; a class list or pattern; predefinedType as one value, a list or a pattern, inherited from the type object, a USERDEFINED type named by ObjectType, ElementType or ProcessType. **Not:** IFC2X3 class from the type (S4) |
| attribute | any direct attribute with a plain value; a name given as a list or pattern; `""` fails even when optional. **Not:** attributes of entities that are not objects or types |
| property | case-sensitive set and property names, or lists and patterns of them; dataType against the value's IFC type; single values and quantities; the type object's sets, inherited. values compared in SI units, from the property's own unit else the project's, for every named unit (an IfcConversionBasedUnit: bridge only; the viewer says "not checked"). **Not:** enumerated, list, bounded and table values; predefined property sets; derived units and temperatures, compared as written, as IfcTester does |
| classification | the reference's Identification (IFC2X3: ItemReference) and every reference above it, against the value; the IfcClassification's Name against the system; each judged over all of the element's references, as IfcTester does; the type's references kept for a system the occurrence does not reference. **Bridge only:** the viewer's fragments model carries no classification, so the viewer says "not checked" for any specification that names one. **Not:** classifications of resources that are not objects or types (an IfcMaterial's) |
| material | the element's material, else its type's: a material's Name and Category; a list's materials'; a layer, profile or constituent set's own name and each item's Name, Category and material; a set usage read as its set. Both readers |
| partOf | all five relations, as IfcTester reads them: aggregation and nesting walked up; containment, direct else the parent's container; the group; voids and fills; no relation: the get_parent walk with a group fallback. The entity and predefined type are judged on the first ancestor of that class. **Bridge only:** groups, voids and fills, and the no-relation walk; the viewer says "not checked" for them, and for an element whose container could be reached through an opening |
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
1. **Multi-value properties:** enumerated, list, bounded and table (9 wrong on both readers). The viewer's gap is
   upstream, in That Open's fragments importer. The bridge reader could read them, but that isn't built.
2. **IFC2X3 class from the type** (S4): wrong on real Revit IFC2X3 models.
3. **The viewer cannot see every IFC relation.** That Open's fragments importer drops:
   - classification (27 official cases);
   - groups, and voids and fills (7 official partOf cases);
   - conversion-based units, such as feet, inches and degrees (Aster S12).

   The viewer says "not checked" for each and never guesses. The bridge reads them all. Derived units and temperatures
   are compared as written by both readers, and by IfcTester.
4. **IDS about entities that are not objects or types:** tasks, styles, classifications as entities (22). An
   IfcMaterial's classification is 1 more on the bridge. That's outside what Sentinel reads.
5. **ifcVersion is not applied, and the `.ids` file is not validated against the XSD.**

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
  - The mini suite fails on any wrong verdict, and on any "not checked" other than the viewer's classification, group,
    voids-and-fills and any-relation cases and its length in feet.
  - The official suite fails if any case in `official-baseline.json` (244 viewer, 276 bridge) stops being right.
- After a fix, rerun with `--baseline` to raise the bar.
