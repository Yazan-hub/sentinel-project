// sentinel-core/adapter/element-properties — read ONE element's full IFC data from a loaded fragments
// model, parsed into a clean, grouped, IDS-ready shape for the Properties Palette (Phase 1). Handles the
// two IFC shapes the raw data mixes: Pset properties live under IsDefinedBy→HasProperties→NominalValue,
// quantity sets under IsDefinedBy→Quantities→<type>Value. Companion to fragments-facts.ts (which builds
// the many-element ElementFacts); this is the single-element, all-psets inspector.

import type * as FRAGS from "@thatopen/fragments";

export interface PropRow {
  name: string;
  value: string;
  type?: string; // the value's IFC type ("IFCLABEL"), where the reader carries it — an IDS dataType is judged against it
  /** The value in SI units, where the file's unit for it is not SI (siValue): an IDS 1.0 value is compared with this. null = the
   *  reader cannot read that unit (said as "not checked", unreadFacets). Unset = the value is SI as written. */
  si?: string | null;
}
export interface PropGroup {
  name: string; // pset / quantity-set name, e.g. "Pset_WallCommon"
  rows: PropRow[];
}
export interface ElementProperties {
  modelId: string;
  localId: number;
  identity: {
    GlobalId?: string;
    Name?: string;
    Class?: string; // IFC class, e.g. IFCWALLSTANDARDCASE
    ObjectType?: string;
    PredefinedType?: string;
    Tag?: string;
    [attribute: string]: string | undefined; // any other direct attribute with a plain value (Description, LongName, …)
  };
  psets: PropGroup[]; // Pset_* property sets
  quantities: PropGroup[]; // Qto_* quantity sets
  /** The element's type object, where the reader relates it: an IDS predefinedType is inherited from it. */
  type?: { Class?: string; PredefinedType?: string; ElementType?: string; ProcessType?: string };
  /** IDS classification: every reference (own, else the type's per system), and every reference above each, with its system's
   *  Name. Unset = this reader does not read classifications (the viewer's fragments model drops them); [] = none. */
  classifications?: { value?: string; system?: string }[];
  /** IDS material: materialValues of the element's material, else its type's. Unset = not read; null = none. */
  material?: string[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const val = (o: any): string | undefined => {
  if (o == null) return undefined;
  if (!Array.isArray(o) && typeof o === "object" && "value" in o) {
    return o.value == null ? undefined : String(o.value);
  }
  return undefined;
};

/** getItemsData relations that reach every property and quantity VALUE: an element's sets and type (IsDefinedBy,
 *  IsTypedBy), a type's sets (HasPropertySets), each set's HasProperties / Quantities — and never a set's or a type's
 *  links back to the elements (DefinesOccurrence, ObjectTypeOf, Types) or its associations. A nested item takes its
 *  own relation's entry, else its parent's. `IsDefinedBy: {relations: false}`, as every reader here had it, returned
 *  each set's name with none of its values (seen 2026-09-29: aster-tower v3's COBie read 0/168 in the browser, 168/168
 *  on the bridge). Shared by every reader of Pset/Qto values. */
export const PSET_RELATIONS = {
  IsDefinedBy: { attributes: true, relations: true },
  IsTypedBy: { attributes: true, relations: true },
  HasPropertySets: { attributes: true, relations: true },
  HasProperties: { attributes: true, relations: false },
  Quantities: { attributes: true, relations: false },
  DefinesOccurrence: { attributes: false, relations: false },
  ObjectTypeOf: { attributes: false, relations: false },
  Types: { attributes: false, relations: false },
  HasAssociations: { attributes: false, relations: false },
};

// A quantity's IFC measure type, as IfcTester reads it off the schema (an IDS dataType on a Qto_ property); bridge/ifc-extract.mjs has the same.
const QTY_TYPES = { LengthValue: "IFCLENGTHMEASURE", AreaValue: "IFCAREAMEASURE", VolumeValue: "IFCVOLUMEMEASURE",
  CountValue: "IFCCOUNTMEASURE", WeightValue: "IFCMASSMEASURE" } as const;

/** getItemsData options that pull attributes + Pset/Qto sets with each value's own unit, the material, and (on the project)
 *  the units (the IDS checker and the Properties palette; the bulk readers keep PSET_RELATIONS). Fragments relate an element's
 *  material straight under HasAssociations, with its layers, profiles, constituents and materials below, each relation named
 *  (an unnamed one takes relationsDefault and its attributes are lost); AssociatedTo, PartOfPset, a unit's Dimensions and a
 *  derived unit's Elements are cut. */
export const PROPERTY_DATA_CONFIG = {
  attributesDefault: true,
  relations: { ...PSET_RELATIONS,
    ...Object.fromEntries(["AssociatedTo", "PartOfPset", "Dimensions", "Elements"].map((k) => [k, { attributes: false, relations: false }])),
    ...Object.fromEntries(["HasAssociations", "ForLayerSet", "ForProfileSet", "MaterialLayers", "MaterialProfiles", "MaterialConstituents", "Materials", "Material",
      "HasProperties", "Quantities", "Unit", "UnitsInContext", "Units", "ConversionFactor", "UnitComponent"].map((k) => [k, { attributes: true, relations: true }])) },
  relationsDefault: { attributes: false, relations: false },
};

// ── SI units. IDS 1.0 values are SI; IfcTester converts a value of a named unit (ifcopenshell.util.unit), the property's own unit
// else the project's for its measure. A derived unit (a U-value's) and a temperature are compared as written, as IfcTester does. ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all = (x: any): any[] => (Array.isArray(x) ? x : x && typeof x === "object" ? [x] : []);
const PREFIX: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
const NAMED_UNIT = /^(ABSORBEDDOSE|AMOUNTOFSUBSTANCE|AREA|DOSEEQUIVALENT|ELECTRIC(CAPACITANCE|CHARGE|CONDUCTANCE|CURRENT|RESISTANCE|VOLTAGE)|ENERGY|FORCE|FREQUENCY|ILLUMINANCE|INDUCTANCE|LENGTH|LUMINOUS(FLUX|INTENSITY)|MAGNETICFLUX(DENSITY)?|MASS|PLANEANGLE|POWER|PRESSURE|RADIOACTIVITY|SOLIDANGLE|TIME|VOLUME)UNIT$/;
/** A measure's unit type, as ifcopenshell's get_measure_unit_type reads it: IFCPOSITIVELENGTHMEASURE → LENGTHUNIT. */
const unitTypeOf = (measure?: string) => (measure ?? "").toUpperCase().replace(/^IFC/, "").replace(/MEASURE$/, "").replace(/^NON/, "").replace(/^(POSITIVE|NEGATIVE)/, "") + "UNIT";

/** A unit's scale to SI from either reader's item: an IfcSIUnit's prefix (squared for SQUARE_, cubed for CUBIC_; a gram is 1e-3 kg),
 *  an IfcConversionBasedUnit's factor (ValueComponent × its unit's scale). undefined = not readable here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unitScale(u: any): number | undefined {
  const cls = String(val(u?._category) ?? "").toUpperCase(), name = String(val(u?.Name) ?? "").toUpperCase();
  if (cls === "IFCSIUNIT") {
    const p = PREFIX[String(val(u.Prefix) ?? "").toUpperCase()] ?? 1;
    return (name.startsWith("SQUARE") ? p ** 2 : name.startsWith("CUBIC") ? p ** 3 : p) * (name === "GRAM" ? 1e-3 : 1);
  }
  if (cls !== "IFCCONVERSIONBASEDUNIT") return undefined; // with an offset (°F), or an item the reader left empty (fragments: any conversion-based unit)
  const f = all(u.ConversionFactor)[0], v = Number(val(f?.ValueComponent)), s = unitScale(all(f?.UnitComponent)[0]);
  return Number.isFinite(v) && s != null ? v * s : undefined;
}

/** The project's units (an IfcUnitAssignment item): each named unit type's scale, null where the unit cannot be read; `unread` =
 *  some unit came through with no type at all (That Open's fragments importer keeps an IfcConversionBasedUnit as an empty item). */
export interface ModelUnits { scale: Record<string, number | null>; unread: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function projectUnits(assignment: any): ModelUnits {
  const out: ModelUnits = { scale: {}, unread: false };
  for (const u of all(assignment?.Units)) {
    const t = String(val(u?.UnitType) ?? "").toUpperCase();
    if (!t) out.unread = true;
    else if (NAMED_UNIT.test(t)) out.scale[t] = unitScale(u) ?? null;
  }
  return out;
}

/** The viewer's project units: the IFCPROJECT among a model's items, fetched with PROPERTY_DATA_CONFIG. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const modelUnits = (items: any[]): ModelUnits | undefined => {
  const p = items.find((d) => String(val(d?._category) ?? "").toUpperCase() === "IFCPROJECT");
  return p ? projectUnits(all(p.UnitsInContext)[0]) : undefined;
};

/** A value in SI units (PropRow.si): undefined = SI as written, or not a named unit's measure; null = its unit cannot be read. `own`
 *  is the property's or quantity's own unit, which wins over the project's. A unit the file does not assign is SI. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function siValue(value: string, measure: string | undefined, own: any, units: ModelUnits | undefined): string | null | undefined {
  const t = unitTypeOf(measure), n = Number(value);
  if (!NAMED_UNIT.test(t) || value.trim() === "" || !Number.isFinite(n)) return undefined;
  const s = own ? unitScale(own) ?? null : units && t in units.scale ? units.scale[t] : units?.unread ? null : 1;
  return s == null ? null : s === 1 ? undefined : String(n * s);
}

/** An IDS material facet's values, as IfcTester reads them (ifcopenshell get_material, a set usage read as its set): a material's
 *  Name and Category; a list's materials'; a layer, profile or constituent set's own name and each item's Name, Category and
 *  material's Name and Category. `m` is a material item as either reader holds it: attributes wrapped as {value}, its class in
 *  `_category`, a reference one item or a list. [] = a material with no names. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function materialValues(m: any): string[] {
  const cls = String(val(m?._category) ?? "").toUpperCase();
  if (cls === "IFCMATERIALLAYERSETUSAGE") return materialValues(all(m.ForLayerSet)[0]);
  if (/^IFCMATERIALPROFILESETUSAGE/.test(cls)) return materialValues(all(m.ForProfileSet)[0]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const own = (x: any) => [val(x?.Name), val(x?.Category)];
  const items = all(m?.MaterialLayers ?? m?.MaterialProfiles ?? m?.MaterialConstituents);
  const vs = cls === "IFCMATERIALLIST" ? all(m.Materials).flatMap(own)
    : /SET$/.test(cls) ? [cls === "IFCMATERIALLAYERSET" ? val(m.LayerSetName) : val(m.Name), ...items.flatMap((i) => [...own(i), ...own(all(i.Material)[0])])]
    : own(m);
  return [...new Set(vs.filter((v): v is string => v != null))];
}

/** Extract a single element's identity + all property/quantity sets from a fragments model. */
export async function extractElementProperties(
  model: FRAGS.FragmentsModel,
  localId: number,
): Promise<ElementProperties> {
  const results = await model.getItemsData([localId], PROPERTY_DATA_CONFIG);
  return parseElementProperties(results?.[0], model.modelId, localId);
}

/** Pure parse of one raw ItemData record → ElementProperties. Lets the model validator bulk-fetch once. `units`: the model's
 *  (modelUnits), for each value's SI form. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseElementProperties(data: any, modelId: string, localId: number, units?: ModelUnits): ElementProperties {
  const identity: ElementProperties["identity"] = {
    GlobalId: val(data?.["_guid"]) ?? val(data?.["GlobalId"]),
    Name: val(data?.["Name"]),
    Class: val(data?.["_category"]) ?? val(data?.["category"]),
    ObjectType: val(data?.["ObjectType"]),
    PredefinedType: val(data?.["PredefinedType"]),
    Tag: val(data?.["Tag"]),
  };
  // Every other direct attribute with a plain value, so an IDS attribute facet can name any (Description, LongName, …).
  for (const [k, v] of Object.entries(data ?? {})) {
    if (!(k in identity) && !k.startsWith("_") && v && typeof v === "object" && !Array.isArray(v) && "value" in v
        && v.value != null && typeof v.value !== "object") identity[k] = String(v.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeOf = (o: any): string | undefined => (typeof o?.type === "string" && /^IFC/i.test(o.type) ? o.type.toUpperCase() : undefined); // only an IFC type name

  const psets: PropGroup[] = [];
  const quantities: PropGroup[] = [];

  // An occurrence's own sets come through IsDefinedBy, and so does its type object (fragments relate it there), carrying the
  // type's sets under HasPropertySets; a type object's own sets come through HasPropertySets. Own rows first: a type's row never
  // overrides one, as on the bridge (ifc-extract mergeTypeGroups) — properties_can_be_inherited_from_the_type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
  const typeItem = arr(data?.["IsDefinedBy"]).find((s) => /(TYPE|STYLE)$/.test(String(val(s?.["_category"]) ?? "").toUpperCase()) || Array.isArray(s?.["HasPropertySets"]));
  const definedBy = [...arr(data?.["IsDefinedBy"]).filter((s) => s !== typeItem), ...arr(data?.["HasPropertySets"]), ...arr(typeItem?.["HasPropertySets"])];
  const type = typeItem ? { Class: val(typeItem["_category"]), PredefinedType: val(typeItem["PredefinedType"]), ElementType: val(typeItem["ElementType"]), ProcessType: val(typeItem["ProcessType"]) } : undefined;
  const add = (list: PropGroup[], name: string, rows: PropRow[]) => {
    const g = list.find((x) => x.name === name);
    if (!g) list.push({ name, rows });
    else for (const r of rows) if (!g.rows.some((x) => x.name === r.name)) g.rows.push(r);
  };
  if (definedBy.length) {
    for (const set of definedBy) {
      const setName = val(set?.["Name"]) ?? "Property Set";
      const hasProps = set?.["HasProperties"];
      const qtys = set?.["Quantities"];

      if (Array.isArray(hasProps)) {
        const rows: PropRow[] = [];
        for (const p of hasProps) {
          const name = val(p?.["Name"]);
          const value = val(p?.["NominalValue"]) ?? val(p?.["Value"]);
          const type = typeOf(p?.["NominalValue"]);
          const si = value != null ? siValue(value, type, all(p?.["Unit"])[0], units) : undefined;
          if (name && value != null) rows.push({ name, value, ...(type ? { type } : {}), ...(si !== undefined ? { si } : {}) });
        }
        if (rows.length) add(psets, setName, rows);
      }

      if (Array.isArray(qtys)) {
        const rows: PropRow[] = [];
        for (const q of qtys) {
          const name = val(q?.["Name"]);
          const key = (Object.keys(QTY_TYPES) as (keyof typeof QTY_TYPES)[]).find((k) => val(q?.[k]) != null);
          const value = key ? val(q[key]) : val(q?.["Value"]);
          const si = key && value != null ? siValue(value, QTY_TYPES[key], all(q?.["Unit"])[0], units) : undefined;
          if (name && value != null) rows.push({ name, value, ...(key ? { type: QTY_TYPES[key] } : {}), ...(si !== undefined ? { si } : {}) });
        }
        if (rows.length) add(quantities, setName, rows);
      }
    }
  }

  psets.sort((a, b) => a.name.localeCompare(b.name));
  quantities.sort((a, b) => a.name.localeCompare(b.name));
  // The material, own else the type's (every caller fetches with PROPERTY_DATA_CONFIG, which asks for HasAssociations).
  // Classifications stay unset: That Open's fragments importer keeps no IfcClassificationReference (seen 2026-10-20).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matOf = (x: any) => arr(x?.["HasAssociations"]).find((a) => /^IFCMATERIAL/.test(String(val(a?.["_category"]) ?? "").toUpperCase()));
  const m = matOf(data) ?? matOf(typeItem);
  return { modelId, localId, identity, psets, quantities, ...(type ? { type } : {}), material: m ? materialValues(m) : null };
}
