# IDS 1.0 conformance — Sentinel's IDS checker (2026-10-20)

**Status.** Measured on buildingSMART's official IDS 1.0 test cases (v1.0.0, 313 cases), on Sentinel's own 53-case
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
| + partOf, viewer reader | 244 | 35 | 34 |
| + partOf, bridge reader | 276 | 37 | 0 |
| + multi-value properties, IFC2X3 class from the type, viewer reader | 239 | 26 | 48 |
| + multi-value properties, IFC2X3 class from the type, bridge reader | **285** | **28** | 0 |
| + the converter keeps IDS data, viewer reader | **286** | **26** | 1 |
| the same, a viewer `.frag` converted before 2026-10-20 | 239 | 26 | 48 |
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

**+ multi-value properties, IFC2X3 class from the type, ifcVersion:**
- **Bridge:** it reads enumerated, list, bounded and table values, as IfcTester does:
  - an IDS value is met by any one value;
  - a list's and a bound's values are converted to SI units;
  - a table's columns are compared only where their type is the IDS dataType.

  All 9 such official cases are right. The bridge is wrong on 9% (28 of 313).
- **Viewer, 5 fewer right — lucky answers gone:** That Open's fragments importer, with the settings Sentinel gives it,
  keeps each of these properties as an item with no class, no name and no value. The viewer used to read such a property
  as missing, so it failed its 9 `pass-` cases (wrong). It "passed" its 5 `fail-` cases only by luck: 4 multi-value
  cases and 1 reference property. It now says "not checked" for a property its set may hold unread. Its wrong count
  fell by 9, to 26 (10% of the 265 it answers).
- **IFC2X3:** an occurrence is also the class its type names (an IfcWallStandardCase typed by an IfcWallType is an
  IFCWALL), as IfcTester does. No official case is IFC2X3. The mini suite and Aster Tower (S4) are.
- **ifcVersion is metadata.** The official case `ids/pass-specification_version_is_purely_metadata_and_does_not_impact_pass_or_fail_result`
  says so, and IfcTester does not filter by version either. Filtering would make Sentinel wrong, so the version never
  changes a verdict. The viewer panel adds a note when a specification was written for another schema than the model's.

**Why the viewer could not see some data: Sentinel's converter settings.** Until this change, Sentinel converted IFC to
`.frag` with `IfcImporter` (`@thatopen/fragments` 3.4.7) at its default class and relation lists.

The default classes leave out:
- the enumerated, list, bounded, table and reference property values;
- IfcConversionBasedUnit and IfcMeasureWithUnit;
- IfcClassification and IfcClassificationReference;
- IfcGroup;
- IfcOpeningElement.

The default relations leave out classification, group, voids and fills.

Adding IFCPROPERTYENUMERATEDVALUE to `classes.abstract` brought the enumerated values back in full (tried
2026-10-20). So the data was not lost: the converter was not asked to keep it.
`docs/compliance/THATOPEN_FRAGMENTS_IMPORTER_NOTE_2026-10.md` is a note the founder can send to That Open.

**+ the converter keeps IDS data.** `WebApp/bridge/ifc-to-frag.mjs` now adds those classes to `classes.abstract`, so they
are kept as data with no geometry. It adds the classification relation under the element's `HasAssociations` (beside its
material, as IFC names it), and the group, voids and fills relations with That Open's names. The viewer reader reads the
new shapes through the same functions as the bridge (`multiValues`, `classificationsOf`).
- **Viewer: 286 right, 26 wrong, 1 not checked**, against IfcTester's 288 right. Its 26 wrong are the bridge's 28 less
  two entity-kind differences.
- **The one not checked:** an uncontained assembly in a model with no opening. The viewer cannot tell "no opening" from
  "an opening left out by an older converter", so its "no container" stays unknown.
- **A `.frag` converted before 2026-10-20** (every model already published) keeps its gaps. The viewer says "not
  checked" there: 239 / 26 / 48, exactly as before, and CI holds it to no wrong verdict on the mini suite. A model whose
  `.frag` holds no classification, group or opening at all is treated the same way, for the same reason.
- **No geometry changes.** On every model measured, the items with geometry are the same: Aster Tower 602; the hospital's
  7 models 63,182. Openings come through as data with no mesh (Aster Tower 168, the hospital 735).

| model | IFC | `.frag` at the defaults | `.frag` keeping IDS data | change |
|---|---:|---:|---:|---:|
| Aster Tower (Revit, IFC2X3) | 1.4 MB | 206 KB | 216 KB | +5% |
| West Riverside Hospital, 7 IFC4 models | 225.5 MB | 13.4 MB | 14.5 MB | +8.7% (the MEP models +14–18%) |

Conversion time showed no slowdown. The hospital's 7 models took 41.9 s at the defaults and 38.6 s keeping IDS data,
converted one after the other on this PC.


| facet | cases | viewer right / wrong / not checked | bridge right / wrong / not checked | IfcTester right |
|---|---:|---|---|---:|
| attribute | 56 | 40 / 16 / 0 | 38 / 18 / 0 | 54 |
| classification | 27 | **26** / 1 / 0 | **26** / 1 / 0 | 27 |
| entity | 24 | **24** / 0 / 0 | **24** / 0 / 0 | 24 |
| ids (specification cardinality) | 12 | **12** / 0 / 0 | **12** / 0 / 0 | 11 |
| material | 28 | **28** / 0 / 0 | **28** / 0 / 0 | 28 |
| partof | 34 | **33** / 0 / 1 | **34** / 0 / 0 | 34 |
| property | 74 | **71** / 3 / 0 | **71** / 3 / 0 | 72 |
| restriction | 22 | 17 / 5 / 0 | 17 / 5 / 0 | 22 |
| tolerance | 36 | **35** / 1 / 0 | **35** / 1 / 0 | 16 |

By value restriction, viewer then bridge:
- length 6 / 0 / 0 and 6 / 0 / 0
- enumeration 14 / 1 / 0 and 14 / 1 / 0
- bounds 11 / 5 / 0 and 11 / 5 / 0
- pattern 48 / 2 / 1 and 48 / 3 / 0. The viewer's one not checked is the partOf case above.

By cardinality, viewer then bridge:
- facet prohibited 6 / 0 / 0 and 6 / 0 / 0
- facet optional 12 / 0 / 0 and 12 / 0 / 0
- specification prohibited 3 / 0 / 0 and 3 / 0 / 0

Every `entity/` and `ids/` case is right.

**Where Sentinel beats IfcTester 0.9.0.** Tolerance: 35 of 36 against 16. IfcTester 0.9.0 compares within 1e-6
relative only. The v1.0.0 cases need 1e-6 relative **plus** 1e-6 absolute, and on bounds an exclusive bound tightens by
that tolerance while an inclusive one loosens by it.

**What the 26 wrong cases are (viewer).**
- **22:** the IDS asks about IFC entities that are not building objects or types, and Sentinel's readers read objects
  and types, so the IDS finds nothing and a required specification fails:
  - IfcSurfaceStyleRefraction (12), IfcTaskTime (4), IfcTask (2), IfcSurfaceStyleRendering (2);
  - IfcStairFlight's NumberOfRisers (1);
  - an IfcMaterial's classification (1).

  The IfcClassification case among them is right now: the converter keeps that entity.
- **2:** `invalid-integer_values_cannot_be_stored_with_decimal`. IfcTester passes them too.
- **1:** a predefined property set (IfcDoorPanelProperties).
- **1:** `tolerance/fail-…negative_high_number_lower_bound` differs from its pass twin by 1e-11. That is below what a
  double can hold near 10⁶, so the two are the same number to Sentinel, which reads it as a pass.

The bridge reader's 28 differ from these by which entity kinds each reader holds: the fragments model also carries
IfcQuantityCount, IfcClassification and one more resource, and the bridge reads IfcTask.

## 2. Sentinel's mini suite: 53 cases, every label stamped by IfcTester

`tools/ids-conformance/mini/` uses the same layout. The cases were written with IfcOpenShell by `make_mini_suite.py`,
which stops if IfcTester's verdict on any case differs from the case's name. A case already on disk is not rewritten.
IfcTester: 53 of 53.

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

The 3 cases added with multi-value properties and IFC2X3 cover:
- an IFC2X3 IfcWallStandardCase typed by an IfcWallType, in scope of IFCWALL
- any value of a list property meeting the IDS value
- no value of an enumerated property meeting it

| | right | wrong | not checked |
|---|---:|---:|---:|
| master before 2026-10-20 (`2c43cb12`), 33 cases | 16 | 17 (11 of them false passes) | 0 |
| IDS 1.0 rules, 33 cases, viewer and bridge alike | 29 | **0** | 4 (classification, material) |
| + classification and material, 39 cases, viewer | 33 | **0** | 6 (classification) |
| + classification and material, 39 cases, bridge | 39 | **0** | 0 |
| + SI units, 45 cases, viewer | 38 | **0** | 7 (classification; the length in feet) |
| + SI units, 45 cases, bridge | 45 | **0** | 0 |
| + partOf, 50 cases, viewer | 40 | **0** | 10 (classification; groups, voids and fills; the length in feet) |
| + partOf, 50 cases, bridge | 50 | **0** | 0 |
| + multi-value, IFC2X3, 53 cases, viewer | 41 | **0** | 12 (classification; groups, voids and fills; the length in feet; 2 multi-value properties) |
| + multi-value, IFC2X3, 53 cases, bridge | **53** | **0** | 0 |
| + the converter keeps IDS data, 53 cases, viewer | **51** | **0** | 2 (a model with no classification, or no opening, at all) |
| the same, a viewer `.frag` converted before 2026-10-20 | 42 | **0** | 11 |

## 3. A real model: Aster Tower (Revit 2024, IFC2X3, imperial units, 799 objects and types)

`tools/ids-conformance/real/aster-probe.ids` has 21 specifications. They ran on `AST_ASTR26_Aster Tower.ifc`
(2026-09-26, 1 398 307 bytes). The model has:
- 210 material layer-set usages and 3 material lists;
- Uniformat classification references on the wall types;
- 14 containments, and 168 doors and windows filling openings.

- **Bridge:** 20 of 21 agree exactly with IfcTester (elements in scope, failing, verdict).
- **Viewer:** 20 of 21 agree, as the bridge does. Before the converter kept IDS data, it said "not checked" for S12 (a
  unit in feet), for S17 and S18 (classification) and for S20 (voids and fills).
- **Both readers:** S10 differs only in how failing elements are counted (below).

S1 to S14:
- S1, S2, S3, S5, S6, S7, S8, S9, S11, S13, S14 are the same:
  - names by pattern, dataType, a property in applicability, missing FireRating (42 of 56 doors), a value list
  - a U-value bound, predefinedType, storey names `L\d+`, a required specification with no spaces
  - ObjectType, a LOGICAL UNKNOWN as no value
- **S4 `IFCWALL`:** this used to differ: 0 in scope for Sentinel against 196 for IfcTester. In IFC2X3 an occurrence
  is also the class its type names (IfcWallType → IFCWALL). Both readers now give 196 / 0 / pass, as IfcTester does.
- **S10 "no proxies" (prohibited) differs:** the verdict is the same (fail). IfcTester counts no element as failing a
  prohibited specification, while Sentinel names all 224.
- **S12 door width 0.8–1.2 m:** this used to differ: Sentinel compared 3.0 and failed every door.
  - Now the bridge converts the doors' 3 ft to 0.9144 m and gives 56 / 0 / pass, as IfcTester does.
  - The viewer now does the same. The model's foot is an IfcConversionBasedUnit, which the converter now keeps.

S15 to S18, added with classification and material:
- **S15 walls carry a material:** 196 / 0 / pass for both readers and IfcTester.
- **S16 a Gypsum Wall Board layer:** 196 / 32 / fail for both readers and IfcTester, read through the layer-set usages.
- **S17 Uniformat, from the type:** 196 / 0 / pass for both readers and IfcTester.
- **S18 Uniformat B2010:** 196 / 164 / fail for both readers and IfcTester.

S19 to S21, added with partOf:
- **S19 walls are contained in a building storey:** 196 / 0 / pass for both readers and IfcTester.
- **S20 windows fill an opening in a wall:** 112 / 0 / pass for both readers and IfcTester.
- **S21 storeys are part of a building:** 15 / 0 / pass for both readers and IfcTester.

## What Sentinel judges, and what it does not

| part of IDS 1.0 | Sentinel |
|---|---|
| entity (applicability or requirements) | the class written, upper case, never a subtype; a class list or pattern; predefinedType as one value, a list or a pattern, inherited from the type object, a USERDEFINED type named by ObjectType, ElementType or ProcessType. in IFC2X3, also the class its type names (IfcTester) |
| attribute | any direct attribute with a plain value; a name given as a list or pattern; `""` fails even when optional. **Not:** attributes of entities that are not objects or types |
| property | case-sensitive set and property names, or lists and patterns of them; dataType against the value's IFC type; single values and quantities; the type object's sets, inherited. values compared in SI units, from the property's own unit else the project's, for every named unit (both readers; a viewer `.frag` converted before 2026-10-20 has no IfcConversionBasedUnit, and says "not checked"). enumerated, list, bounded and table values, met by any one value (a table's: the columns of the IDS dataType); both readers; a viewer `.frag` converted before 2026-10-20 left these values out, and says "not checked" where a set holds one. **Not:** predefined property sets; reference properties; derived units and temperatures, compared as written, as IfcTester does |
| classification | the reference's Identification (IFC2X3: ItemReference) and every reference above it, against the value; the IfcClassification's Name against the system; each judged over all of the element's references, as IfcTester does; the type's references kept for a system the occurrence does not reference. Both readers; a viewer `.frag` with no classification at all (converted before 2026-10-20, or a model without any) says "not checked". **Not:** classifications of resources that are not objects or types (an IfcMaterial's) |
| material | the element's material, else its type's: a material's Name and Category; a list's materials'; a layer, profile or constituent set's own name and each item's Name, Category and material; a set usage read as its set. Both readers |
| partOf | all five relations, as IfcTester reads them: aggregation and nesting walked up; containment, direct else the parent's container; the group; voids and fills; no relation: the get_parent walk with a group fallback. The entity and predefined type are judged on the first ancestor of that class. Both readers; a viewer `.frag` with no group or opening at all (converted before 2026-10-20, or a model without any) says "not checked" where the answer could lie beyond them |
| value restrictions | simpleValue (text exact, numbers within 1e-6 relative + 1e-6 absolute), enumeration, pattern on the whole value, bounds with the same tolerance, length. **Not:** totalDigits, fractionDigits, whiteSpace (said); XSD-only regex syntax (`\i`, `\c`, class subtraction) runs as JavaScript regex |
| facet cardinality | required, optional, prohibited ("shall not be X" fails X only) |
| specification cardinality | an unstated `minOccurs` is 1 (the XSD's default): required. Prohibited everywhere; required on a whole model only (the viewer, a file judged on its own), never on a changeset or an intake's class subset |
| ifcVersion | metadata, as IDS 1.0 v1.0.0 pins it: it never changes a verdict; the viewer notes a specification written for another schema than the model's |
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
1. **Every model already published has a `.frag` converted before 2026-10-20.** Those files lack classification,
   multi-value properties, groups, openings and conversion-based units. The viewer says "not checked" for each, and
   never guesses (official suite 239 / 26 / 48). Converting the IFC again gives the full read. A model with no
   classification, group or opening at all is "not checked" for those facets too, as the viewer cannot tell it from an
   older file. Derived units and temperatures are compared as written by both readers, and by IfcTester.
2. **IDS about entities that are not objects or types:** tasks, styles, an IfcStairFlight's NumberOfRisers (21), and an
   IfcMaterial's classification (1). That's outside what Sentinel reads.
3. **Small ones:**
   - a predefined property set (IfcDoorPanelProperties, 1);
   - integers written with a decimal (2, which IfcTester passes too);
   - a tolerance case below double precision (1).
4. **The `.ids` file is not validated against the IDS 1.0 XSD.**

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
  - The mini suite fails on any wrong verdict, and on any "not checked" other than the viewer's 2 (a model with no
    classification, or no opening, at all).
  - A viewer `.frag` converted at the importer's defaults, as before 2026-10-20, must give no wrong verdict on the mini
    suite.
  - The official suite fails if any case in `official-baseline.json` (286 viewer, 285 bridge) stops being right.
    The 5 viewer cases that were right only by luck left the baseline with the multi-value step.
- After a fix, rerun with `--baseline` to raise the bar.
