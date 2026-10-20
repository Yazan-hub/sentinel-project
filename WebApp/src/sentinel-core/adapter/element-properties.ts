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
  /** An enumerated, list, bounded or table property's values (`value` joins them): an IDS value is met by any one of them. A
   *  table's carry their column. Read by the bridge; That Open's fragments importer keeps these properties as empty items. */
  values?: { value: string; type?: string; si?: string | null; column?: "Defining" | "Defined" }[];
}
export interface PropGroup {
  name: string; // pset / quantity-set name, e.g. "Pset_WallCommon"
  rows: PropRow[];
  /** Properties the reader saw in the set but could not read (fragments: an item with no class and no attributes). */
  unread?: number;
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
  /** The model's IFC schema ("IFC2X3"): in IFC2X3 an IDS entity also matches the class the type names (IfcTester). */
  schema?: string;
  /** The element's type object, where the reader relates it: an IDS predefinedType is inherited from it. */
  type?: { Class?: string; PredefinedType?: string; ElementType?: string; ProcessType?: string };
  /** IDS classification: every reference (own, else the type's per system), and every reference above each, with its system's
   *  Name. Unset = this reader does not read classifications (the viewer's fragments model drops them); [] = none. */
  classifications?: { value?: string; system?: string }[];
  /** IDS material: materialValues of the element's material, else its type's. Unset = not read; null = none. */
  material?: string[] | null;
  /** IDS partOf: the element's direct parent per relation, a localId in the same model (null = none; unset = this reader does not
   *  carry the relation: the viewer's fragments model drops groups, voids and fills). fills: the opening it fills; voids: the
   *  element an opening voids. */
  parents?: { aggregate?: number | null; nest?: number | null; container?: number | null; group?: number | null; fills?: number | null; voids?: number | null };
  /** partOfChains' ancestors per IDS relation ("" = any), each its class and IDS predefined type. Unset = not known here. */
  partOf?: Record<string, { Class: string; PredefinedType: string }[] | undefined>;
  /** The relations whose walk stopped where a relation this reader does not carry may go on: what it found is known, what it did
   *  not find is "not checked" (partOfChains). */
  partOfOpen?: string[];
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

/** getItemsData options that pull attributes + Pset/Qto sets with each value's own unit, the material, the parents an IDS
 *  partOf reads, and (on the project) the units (the IDS checker and the Properties palette; the bulk readers keep PSET_RELATIONS).
 *  Fragments keep one node per item, made with the first relation entry that reaches it, so each of these is {attributes, relations}
 *  like the top level: a parent first reached with relations off loses its own links everywhere (seen 2026-10-20). Fragments relate an element's
 *  material straight under HasAssociations, with its layers, profiles, constituents and materials below, each relation named
 *  (an unnamed one takes relationsDefault and its attributes are lost); AssociatedTo, PartOfPset, a unit's Dimensions and a
 *  derived unit's Elements are cut. */
export const PROPERTY_DATA_CONFIG = {
  attributesDefault: true,
  relations: { ...PSET_RELATIONS,
    ...Object.fromEntries(["AssociatedTo", "PartOfPset", "Dimensions", "Elements", "ClassificationRefForObjects", "IsGroupedBy", "HasOpenings", "HasFillings"]
      .map((k) => [k, { attributes: false, relations: false }])),
    ...Object.fromEntries(["HasAssociations", "ForLayerSet", "ForProfileSet", "MaterialLayers", "MaterialProfiles", "MaterialConstituents", "Materials", "Material",
      "HasProperties", "Quantities", "Unit", "DefiningUnit", "DefinedUnit", "UnitsInContext", "Units", "ConversionFactor", "UnitComponent",
      "ReferencedSource", "Decomposes", "Nests", "ContainedInStructure", "HasAssignments", "FillsVoids", "VoidsElements"]
      .map((k) => [k, { attributes: true, relations: true }])) },
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

/** What a viewer model holds, for parseElementProperties: its units, its schema, and whether its .frag carries any classification,
 *  group or opening at all. A .frag converted before 2026-10-20 (bridge/ifc-to-frag.mjs IDS_CLASSES) has none, and neither has a model
 *  without them: the viewer cannot tell "none" from "left out", so a facet on them is "not checked" there (unreadFacets). */
export interface ModelContext { units?: ModelUnits; schema?: string; carries?: { classification: boolean; groups: boolean; openings: boolean } }
const GROUP_CLASS = /^IFC(GROUP|SYSTEM|ZONE|DISTRIBUTIONSYSTEM|DISTRIBUTIONCIRCUIT|BUILDINGSYSTEM|BUILTSYSTEM|INVENTORY|ASSET|STRUCTURAL(ANALYSISMODEL|LOADGROUP|LOADCASE|RESULTGROUP))$/;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function modelContext(items: any[], schema?: string): ModelContext {
  const cats = [...new Set(items.map((d) => String(val(d?._category) ?? "").toUpperCase()))], has = (re: RegExp) => cats.some((c) => re.test(c));
  return { units: modelUnits(items), schema, carries: { classification: has(/^IFCCLASSIFICATION(REFERENCE)?$/), groups: has(GROUP_CLASS), openings: has(/^IFCOPENING(ELEMENT|STANDARDCASE)$/) } };
}

/** An enumerated, list, bounded or table property's values (PropRow.values) and its IDS value type, as IfcTester reads them, from
 *  either reader's item: a web-ifc list holds typed values ({value, name}); a fragments list is one typed value holding the list
 *  ({value: [...], type}). `si(value, measure, unit)`: a list's or a bound's value in SI units (from the property's unit), a table
 *  column's from its own unit; an enumerated value is not converted (IfcTester). The type: a list's first value's, a bound's last
 *  one's (upper, lower, set point), none for a table (its columns carry theirs). undefined = a single-value property. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function multiValues(p: any, si?: (value: string, measure: string | undefined, unit: any) => string | null | undefined): { values: NonNullable<PropRow["values"]>; type?: string } | undefined {
  const ifc = (t: unknown) => (typeof t === "string" && /^IFC/i.test(t) ? t.toUpperCase() : undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (x: any): { value: string; type?: string }[] => (Array.isArray(x) ? x.map((v) => ({ value: v?.value == null ? "" : String(v.value), type: ifc(v?.name) ?? ifc(v?.type) }))
    : Array.isArray(x?.value) ? x.value.map((v: unknown) => ({ value: String(v), type: ifc(x.type) }))
    : x?.value != null ? [{ value: String(x.value), type: ifc(x.name) ?? ifc(x.type) }] : []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conv = (vs: { value: string; type?: string }[], unit: any, column?: "Defining" | "Defined") => vs.map((v) => {
    const s = si?.(v.value, v.type, unit);
    return { ...v, ...(s !== undefined ? { si: s } : {}), ...(column ? { column } : {}) };
  });
  const bounds = ["UpperBoundValue", "LowerBoundValue", "SetPointValue"];
  let values: NonNullable<PropRow["values"]> | undefined, type: string | undefined;
  if (p && "EnumerationValues" in p) type = (values = items(p.EnumerationValues))[0]?.type;
  else if (p && "ListValues" in p) type = (values = conv(items(p.ListValues), p.Unit))[0]?.type;
  else if (p && bounds.some((k) => k in p)) { values = conv(bounds.flatMap((k) => items(p[k])), p.Unit); type = values[values.length - 1]?.type; }
  else if (p && ("DefiningValues" in p || "DefinedValues" in p))
    values = [...conv(items(p.DefiningValues), p.DefiningUnit, "Defining"), ...conv(items(p.DefinedValues), p.DefinedUnit, "Defined")];
  return values ? { values, ...(type ? { type } : {}) } : undefined;
}

/** IfcTester's classification references (ifcopenshell get_references, get_inherited_references) from either reader's items: the
 *  element's own; the type's, kept for a system the element does not reference; each with every reference above it (ReferencedSource)
 *  and its IfcClassification's Name. A classification assigned directly counts, with no value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classificationsOf(own: any[], type: any[]): NonNullable<ElementProperties["classifications"]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cls = (x: any) => String(val(x?._category) ?? "").toUpperCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = (r: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = [];
    let x = r;
    for (let n = 0; x && cls(x) !== "IFCCLASSIFICATION" && n < 64; n++) { rows.push(x); x = all(x.ReferencedSource)[0]; }
    const root = cls(x) === "IFCCLASSIFICATION" ? x : undefined, system = val(root?.Name);
    return { key: root ? val(root._localId) ?? root.expressID ?? root : null, rows: rows.length ? rows.map((y) => ({ value: val(y.Identification) ?? val(y.ItemReference), system })) : [{ system }] };
  };
  const bySystem = new Map<unknown, unknown[]>();
  for (const r of type) bySystem.set(chain(r).key, [...(bySystem.get(chain(r).key) ?? []), r]);
  for (const k of new Set(own.map((r) => chain(r).key))) bySystem.set(k, own.filter((r) => chain(r).key === k));
  return [...bySystem.values()].flat().flatMap((r) => chain(r).rows);
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

/** Pure parse of one raw ItemData record → ElementProperties. Lets the model validator bulk-fetch once. `model`: what the whole
 *  model holds (modelContext): its units, for each value's SI form; its schema; whether its .frag carries classification, groups
 *  and openings at all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseElementProperties(data: any, modelId: string, localId: number, model?: ModelContext): ElementProperties {
  const units = model?.units, schema = model?.schema;
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
  const add = (list: PropGroup[], name: string, rows: PropRow[], unread: number) => {
    let g = list.find((x) => x.name === name);
    if (!g) list.push((g = { name, rows: [] }));
    for (const r of rows) if (!g.rows.some((x) => x.name === r.name)) g.rows.push(r);
    if (unread) g.unread = (g.unread ?? 0) + unread;
  };
  if (definedBy.length) {
    for (const set of definedBy) {
      const setName = val(set?.["Name"]) ?? "Property Set";
      const hasProps = set?.["HasProperties"];
      const qtys = set?.["Quantities"];

      if (Array.isArray(hasProps)) {
        const rows: PropRow[] = [];
        let unread = 0;
        for (const p of hasProps) {
          const name = val(p?.["Name"]);
          if (!name && !val(p?.["_category"])) unread++; // a class the .frag left out (before 2026-10-20: every multi-value property)
          const mv = name ? multiValues(p, (v, t, u) => siValue(v, t, all(u)[0], units)) : undefined;
          if (mv) { rows.push({ name: name!, value: mv.values.map((x) => x.value).join(", "), ...(mv.type ? { type: mv.type } : {}), values: mv.values }); continue; }
          const value = val(p?.["NominalValue"]) ?? val(p?.["Value"]);
          const type = typeOf(p?.["NominalValue"]);
          const si = value != null ? siValue(value, type, all(p?.["Unit"])[0], units) : undefined;
          if (name && value != null) rows.push({ name, value, ...(type ? { type } : {}), ...(si !== undefined ? { si } : {}) });
        }
        if (rows.length || unread) add(psets, setName, rows, unread);
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
        if (rows.length) add(quantities, setName, rows, 0);
      }
    }
  }

  psets.sort((a, b) => a.name.localeCompare(b.name));
  quantities.sort((a, b) => a.name.localeCompare(b.name));
  // The material, own else the type's (every caller fetches with PROPERTY_DATA_CONFIG, which asks for HasAssociations), and the
  // classification references beside it, where the .frag carries classification at all (modelContext).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matOf = (x: any) => arr(x?.["HasAssociations"]).find((a) => /^IFCMATERIAL/.test(String(val(a?.["_category"]) ?? "").toUpperCase()));
  const m = matOf(data) ?? matOf(typeItem);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refsOf = (x: any) => arr(x?.["HasAssociations"]).filter((a) => /^IFCCLASSIFICATION(REFERENCE)?$/.test(String(val(a?.["_category"]) ?? "").toUpperCase()));
  const classifications = model?.carries?.classification ? { classifications: classificationsOf(refsOf(data), refsOf(typeItem)) } : {};
  // partOf's direct parents: aggregation, nesting and containment always come through; groups, voids and fills where the .frag
  // carries them at all (else left unset: unreadFacets says "not checked").
  const first = (k: string) => { const id = Number(val(arr(data?.[k])[0]?.["_localId"])); return Number.isFinite(id) ? id : null; };
  const parents = { aggregate: first("Decomposes"), nest: first("Nests"), container: first("ContainedInStructure"),
    ...(model?.carries?.groups ? { group: first("HasAssignments") } : {}), ...(model?.carries?.openings ? { fills: first("FillsVoids"), voids: first("VoidsElements") } : {}) };
  return { modelId, localId, identity, psets, quantities, ...(type ? { type } : {}), material: m ? materialValues(m) : null, ...classifications, parents, ...(schema ? { schema } : {}) };
}
