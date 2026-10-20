# A note for That Open: IDS data and the IfcImporter defaults (2026-10-20)

Hello That Open team,

Sentinel checks models against buildingSMART IDS 1.0. We run your `IfcImporter` (`@thatopen/fragments` 3.4.7, web-ifc
0.0.77, Node) to make the `.frag`, then read each element back with `getItemsData`. We measured the result against
buildingSMART's official IDS 1.0 test cases (v1.0.0). We call the importer with its default class and relation lists, and
at those defaults some data IDS needs does not come through. We found it is a matter of defaults, not lost data, so we
want to describe it carefully.

## What we see at the defaults

An item whose class is not in `classes.abstract` or `classes.elements` still appears where an element points to it, but
as a stub: `_category: null`, its `_localId`, and no attributes, not even `Name`. A relation not in `relations` is not
kept at all.

| IFC data | at the defaults | IDS 1.0 cases it affects |
|---|---|---|
| IfcPropertyEnumeratedValue, IfcPropertyListValue, IfcPropertyBoundedValue, IfcPropertyTableValue, IfcPropertyReferenceValue | stub: the property's name and values are gone | 14 property cases |
| IfcConversionBasedUnit, IfcMeasureWithUnit | stub inside `UnitsInContext`: a model in feet loses its unit | every length, area, volume or angle bound on an imperial model |
| IfcClassification, IfcClassificationReference, IfcRelAssociatesClassification | not kept | 27 classification cases |
| IfcGroup, IfcRelAssignsToGroup | not kept | 6 partOf cases |
| IfcOpeningElement, IfcRelVoidsElement, IfcRelFillsElement | not kept: a window's opening and its wall | partOf through voids and fills |

## What we tried

We added `WEBIFC.IFCPROPERTYENUMERATEDVALUE` to `importer.classes.abstract`. The property came back in full:
`EnumerationValues: { value: ["EXISTING", "DEMOLISH"], type: "IFCLABEL" }`, with its `EnumerationReference`. So the data
is there to keep.

## What we would like to ask

1. **Could the defaults include the property-value classes and the conversion-based units?**
   - The property values are enumerated, list, bounded, table and reference.
   - The units are IfcConversionBasedUnit and IfcMeasureWithUnit.

   They carry no geometry, and IDS, COBie and most data checks read them. A user of the defaults cannot tell that they
   are missing.
2. **Could classification be kept by default, or behind one documented switch?** That covers IfcClassification,
   IfcClassificationReference and IfcRelAssociatesClassification. Classification is common in real IDS files.
3. **Is there a supported way to keep IfcRelVoidsElement and IfcRelFillsElement without rendering opening elements as
   geometry?**
4. **Could a left-out class be marked, not stubbed?** An item with `_category: null` and no attributes is easy to read
   as "no property here". We now treat it as "could not read", but other readers will not know to. An explicit marker,
   or leaving the item out, would be safer.
5. **One `getItemsData` behaviour we would like to understand.**
   - What we see: one node is shared per item, and it is built with the first relation entry that reaches it.
   - Example: we asked for `Decomposes` with `{ attributes: true, relations: false }`. A slab first reached as a beam's
     parent then lacked its own `Decomposes` at the top level too. With `{ attributes: true, relations: true }` it was
     complete.
   - Is that intended? If it is, it would help to document it.

## To reproduce

1. Take `Documentation/testcases/property/pass-any_matching_value_in_an_enumerated_property_will_pass_1_3.ifc` from
   `github.com/buildingSMART/IDS`, tag v1.0.0.
2. Run it through these lines:

```js
const imp = new IfcImporter(); imp.wasm = { absolute: true, path: WASM_DIR };
const model = new SingleThreadedFragmentsModel("m", await imp.process({ bytes }));
const wall = Object.values(await model.getItemsOfCategories([/^IFCWALL$/])).flat();
const R = { attributes: true, relations: true };
const [d] = await model.getItemsData(wall, { attributesDefault: true, relationsDefault: { attributes: false, relations: false },
  relations: { IsDefinedBy: R, HasProperties: R } });
console.log(JSON.stringify(d.IsDefinedBy[0].HasProperties)); // [{"_category":{"value":null},"_localId":{"value":11},…}]
```

3. Add `imp.classes.abstract.add(WEBIFC.IFCPROPERTYENUMERATEDVALUE)` before `process` and run it again. The property
   now has its name and values.

Thank you. We are glad to test a change, or to send more of the IDS cases.

Sentinel, Yazan Hijazeen
