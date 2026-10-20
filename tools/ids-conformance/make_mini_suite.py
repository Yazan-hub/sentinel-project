# Sentinel's own IDS 1.0 mini suite: small IFC + .ids pairs in the buildingSMART test-case layout (<facet>/<pass|fail>-<name>.ids
# + .ifc), built with IfcOpenShell. IfcTester stamps every expected verdict: a case whose IfcTester verdict differs from its name
# stops the build, so the labels are IfcTester's, not ours. Written once and committed (IfcOpenShell writes fresh GUIDs and dates):
# a case already on disk is not rewritten, only checked again.
#   %APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/make_mini_suite.py tools/ids-conformance/mini
import os, sys
import ifcopenshell, ifcopenshell.api as api
import ifcopenshell.api.project, ifcopenshell.api.root, ifcopenshell.api.pset, ifcopenshell.api.classification, ifcopenshell.api.material, ifcopenshell.api.type
import ifcopenshell.api.unit, ifcopenshell.api.aggregate, ifcopenshell.api.spatial, ifcopenshell.api.feature
import ifcopenshell.api.owner, ifcopenshell.api.owner.settings
from ifctester import ids

OUT = sys.argv[1]
R = ids.Restriction
NO_USER = (api.owner.settings.get_user, api.owner.settings.get_application)


def model(build, version="IFC4"):
    f = api.project.create_file(version=version)
    if version == "IFC2X3":  # IFC2X3 needs an owner history on every rooted entity
        po = api.owner.add_person_and_organisation(f, person=api.owner.add_person(f), organisation=api.owner.add_organisation(f))
        app = api.owner.add_application(f)
        api.owner.settings.get_user, api.owner.settings.get_application = (lambda _: po), (lambda _: app)
    api.root.create_entity(f, ifc_class="IfcProject", name="Mini")
    build(f)
    api.owner.settings.get_user, api.owner.settings.get_application = NO_USER
    return f


def el(f, cls, name=None, pdt=None, psets=None, **attrs):
    e = api.root.create_entity(f, ifc_class=cls, name=name, predefined_type=pdt)
    for k, v in attrs.items():
        setattr(e, k, v)
    for pname, props in (psets or {}).items():
        api.pset.edit_pset(f, pset=api.pset.add_pset(f, product=e, name=pname), properties=props)
    return e


def spec(applicability, requirements, minOccurs=0, maxOccurs="unbounded", version="IFC4"):
    s = ids.Specification(name="Mini", minOccurs=minOccurs, maxOccurs=maxOccurs, ifcVersion=[version])
    s.applicability.extend(applicability)
    s.requirements.extend(requirements)
    return s


W = lambda: ids.Entity(name="IFCWALL")
NAME = lambda **k: ids.Attribute(name="Name", **k)
PROP = lambda name, **k: ids.Property(propertySet="Pset_WallCommon", baseName=name, **k)


def classified(f):
    w = el(f, "IfcWall", "W1")
    c = api.classification.add_classification(f, classification="Uniclass")
    api.classification.add_reference(f, products=[w], identification="EF_25_10", name="Walls", classification=c)


def with_material(f):
    w = el(f, "IfcWall", "W1")
    api.material.assign_material(f, products=[w], material=api.material.add_material(f, name="Concrete"))


def ref(f, products, code, system="Uniclass"):
    c = next((x for x in f.by_type("IfcClassification") if x.Name == system), None) or api.classification.add_classification(f, classification=system)
    api.classification.add_reference(f, products=products, identification=code, name=code, classification=c)


def typed(f, material=None, code=None):
    t = api.root.create_entity(f, ifc_class="IfcWallType", name="WT1", predefined_type="SOLIDWALL")
    w = el(f, "IfcWall", "W1")
    api.type.assign_type(f, related_objects=[w], relating_type=t)
    if material:
        api.material.assign_material(f, products=[t], material=api.material.add_material(f, name=material))
    if code:
        ref(f, [t], code)
    return w


def measured(f, units, props=None, qtos=None, own_unit=None):
    # units: project units; props: {name: (measure, value)} in a Sentinel_Mini set; own_unit: (property, unit) set on that property
    api.unit.assign_unit(f, units=units(f))
    w = el(f, "IfcWall", "W1")
    if props:
        pset = api.pset.add_pset(f, product=w, name="Sentinel_Mini")
        api.pset.edit_pset(f, pset=pset, properties={k: f.create_entity(t, v) for k, (t, v) in props.items()})
        if own_unit:
            next(p for p in pset.HasProperties if p.Name == own_unit[0]).Unit = own_unit[1](f)
    if qtos:
        api.pset.edit_qto(f, qto=api.pset.add_qto(f, product=w, name="Qto_WallBaseQuantities"), properties=qtos)
    return w


MM = lambda f: [api.unit.add_si_unit(f, unit_type="LENGTHUNIT", prefix="MILLI")]
WIDTH = lambda: ids.Property(propertySet="Sentinel_Mini", baseName="Width", value=R(options={"minInclusive": 0.8, "maxInclusive": 1.2}, base="double"))


def storey(f):
    # project > site > building > storey, by aggregation; the storey
    parent = f.by_type("IfcProject")[0]
    for cls in ("IfcSite", "IfcBuilding", "IfcBuildingStorey"):
        e = api.root.create_entity(f, ifc_class=cls, name=cls[3:])
        api.aggregate.assign_object(f, products=[e], relating_object=parent)
        parent = e
    return parent


def in_opening(f, fill=True):
    # a wall and a window in a storey; the window fills an opening in the wall
    st = storey(f)
    w, win = el(f, "IfcWall", "W1"), el(f, "IfcWindow", "WIN1")
    api.spatial.assign_container(f, products=[w, win], relating_structure=st)
    if fill:
        o = api.root.create_entity(f, ifc_class="IfcOpeningElement")
        api.feature.add_feature(f, feature=o, element=w)
        api.feature.add_filling(f, opening=o, element=win)


def part_of_assembly(f):
    # a beam aggregated into an assembly that is contained in a storey (the beam itself is not contained)
    a = el(f, "IfcElementAssembly", "A1")
    api.spatial.assign_container(f, products=[a], relating_structure=storey(f))
    api.aggregate.assign_object(f, products=[el(f, "IfcBeam", "B1")], relating_object=a)


def typed_2x3(f):
    # IFC2X3: an IfcWallStandardCase typed by an IfcWallType
    t = api.root.create_entity(f, ifc_class="IfcWallType", name="WT1", predefined_type="STANDARD")
    api.type.assign_type(f, related_objects=[el(f, "IfcWallStandardCase", "W1")], relating_type=t)


def with_prop(f, make):
    # a wall whose Sentinel_Mini set holds one property made by make(f): an enumerated, list, bounded or table value
    api.pset.add_pset(f, product=el(f, "IfcWall", "W1"), name="Sentinel_Mini").HasProperties = [make(f)]


def layer_set_usage(f):
    w = el(f, "IfcWall", "W1")
    s = api.material.add_material_set(f, name="Brick cavity", set_type="IfcMaterialLayerSet")
    api.material.add_layer(f, layer_set=s, material=api.material.add_material(f, name="Brick"))
    api.material.assign_material(f, products=[w], type="IfcMaterialLayerSetUsage", material=s)


CASES = [
    # entity: an exact class, never a subtype; an enumeration of classes; predefinedType
    ("entity", "pass", "a_subtype_is_not_the_entity", lambda f: el(f, "IfcWallStandardCase"), spec([W()], [NAME()])),
    ("entity", "fail", "the_exact_entity_applies", lambda f: el(f, "IfcWall"), spec([W()], [NAME()])),
    ("entity", "pass", "an_entity_enumeration_applies_to_those_classes_only",
     lambda f: (el(f, "IfcWall", "W1"), el(f, "IfcBeam")), spec([ids.Entity(name=R(options={"enumeration": ["IFCWALL", "IFCSLAB"]}))], [NAME()])),
    ("entity", "pass", "another_predefined_type_does_not_apply", lambda f: el(f, "IfcWall", pdt="PARTITIONING"),
     spec([ids.Entity(name="IFCWALL", predefinedType="SOLIDWALL")], [NAME()])),
    ("entity", "fail", "the_predefined_type_applies", lambda f: el(f, "IfcWall", pdt="SOLIDWALL"),
     spec([ids.Entity(name="IFCWALL", predefinedType="SOLIDWALL")], [NAME()])),
    # attribute: case-sensitive values, a pattern on the whole value, any attribute, prohibited with a value
    ("attribute", "pass", "a_value_matches_exactly", lambda f: el(f, "IfcWall", "Wall"), spec([W()], [NAME(value="Wall")])),
    ("attribute", "fail", "values_are_case_sensitive", lambda f: el(f, "IfcWall", "wall"), spec([W()], [NAME(value="Wall")])),
    ("attribute", "pass", "a_pattern_matches_the_whole_value", lambda f: el(f, "IfcWall", "W-01"), spec([W()], [NAME(value=R(options={"pattern": r"W-\d{2}"}))])),
    ("attribute", "fail", "a_pattern_inside_the_value_is_not_a_match", lambda f: el(f, "IfcWall", "XW-01X"), spec([W()], [NAME(value=R(options={"pattern": r"W-\d{2}"}))])),
    ("attribute", "pass", "description_is_an_attribute_too", lambda f: el(f, "IfcWall", "W1", Description="External"),
     spec([W()], [ids.Attribute(name="Description", value="External")])),
    ("attribute", "pass", "prohibited_with_a_value_allows_other_values", lambda f: el(f, "IfcWall", "Good"), spec([W()], [NAME(value="Bad", cardinality="prohibited")])),
    ("attribute", "fail", "prohibited_with_a_value_fails_that_value", lambda f: el(f, "IfcWall", "Bad"), spec([W()], [NAME(value="Bad", cardinality="prohibited")])),
    ("attribute", "fail", "prohibited_without_a_value_fails_any_value", lambda f: el(f, "IfcWall", "Any"), spec([W()], [NAME(cardinality="prohibited")])),
    # property: names are case-sensitive; numbers within 1e-6; booleans; dataType
    ("property", "fail", "property_set_names_are_case_sensitive", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"FireRating": "REI60"}}),
     spec([W()], [ids.Property(propertySet="pset_wallcommon", baseName="FireRating")])),
    ("property", "pass", "a_number_matches_within_tolerance", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"ThermalTransmittance": 0.2500000001}}),
     spec([W()], [PROP("ThermalTransmittance", value="0.25")])),
    ("property", "pass", "a_boolean_matches_true", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"IsExternal": True}}),
     spec([W()], [PROP("IsExternal", value="true")])),
    ("property", "fail", "a_boolean_false_is_not_true", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"IsExternal": False}}),
     spec([W()], [PROP("IsExternal", value="true")])),
    ("property", "pass", "the_data_type_matches", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"FireRating": "REI60"}}),
     spec([W()], [PROP("FireRating", dataType="IFCLABEL")])),
    ("property", "fail", "another_data_type_fails", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"IsExternal": True}}),
     spec([W()], [PROP("IsExternal", dataType="IFCLABEL")])),
    # restriction: enumeration, bounds, length
    ("restriction", "pass", "a_value_in_the_enumeration", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"FireRating": "REI90"}}),
     spec([W()], [PROP("FireRating", value=R(options={"enumeration": ["REI60", "REI90"]}))])),
    ("restriction", "fail", "a_value_outside_the_enumeration", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"FireRating": "REI30"}}),
     spec([W()], [PROP("FireRating", value=R(options={"enumeration": ["REI60", "REI90"]}))])),
    ("restriction", "pass", "a_number_inside_the_bounds", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"ThermalTransmittance": 0.25}}),
     spec([W()], [PROP("ThermalTransmittance", value=R(options={"minInclusive": 0.1, "maxInclusive": 0.3}, base="double"))])),
    ("restriction", "fail", "a_number_outside_the_bounds", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"ThermalTransmittance": 0.5}}),
     spec([W()], [PROP("ThermalTransmittance", value=R(options={"minInclusive": 0.1, "maxInclusive": 0.3}, base="double"))])),
    ("restriction", "fail", "a_value_longer_than_max_length", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"FireRating": "REI60"}}),
     spec([W()], [PROP("FireRating", value=R(options={"maxLength": 4}))])),
    ("restriction", "pass", "a_value_within_min_length", lambda f: el(f, "IfcWall", psets={"Pset_WallCommon": {"FireRating": "REI60"}}),
     spec([W()], [PROP("FireRating", value=R(options={"minLength": 3}))])),
    # ids: specification cardinality, and facets inside applicability
    ("ids", "fail", "a_required_specification_needs_an_applicable_element", lambda f: el(f, "IfcWall", "W1"),
     spec([ids.Entity(name="IFCDOOR")], [NAME()], minOccurs=1)),
    ("ids", "pass", "an_optional_specification_with_none_applicable_passes", lambda f: el(f, "IfcWall", "W1"),
     spec([ids.Entity(name="IFCDOOR")], [NAME()])),
    ("ids", "fail", "a_prohibited_specification_fails_on_any_applicable_element", lambda f: el(f, "IfcDoor", "D1"),
     spec([ids.Entity(name="IFCDOOR")], [], minOccurs=0, maxOccurs=0)),
    ("ids", "pass", "a_property_in_applicability_narrows_the_scope",
     lambda f: (el(f, "IfcWall", "Ext", psets={"Pset_WallCommon": {"IsExternal": True, "FireRating": "REI60"}}),
                el(f, "IfcWall", "Int", psets={"Pset_WallCommon": {"IsExternal": False}})),
     spec([W(), PROP("IsExternal", value="true")], [PROP("FireRating")])),
    # facets Sentinel does not read: the honest answer is "not checked", never a pass
    ("classification", "pass", "a_classification_reference_is_found", classified, spec([W()], [ids.Classification(system="Uniclass")])),
    ("classification", "fail", "a_missing_classification_fails", lambda f: el(f, "IfcWall", "W1"), spec([W()], [ids.Classification(system="Uniclass")])),
    ("material", "pass", "an_assigned_material_is_found", with_material, spec([W()], [ids.Material()])),
    ("material", "fail", "a_missing_material_fails", lambda f: el(f, "IfcWall", "W1"), spec([W()], [ids.Material()])),
    # classification and material as IfcTester reads them: through the type, per system, a set usage, IFC2X3's ItemReference
    ("classification", "pass", "a_classification_in_applicability_narrows_the_scope",
     lambda f: (ref(f, [el(f, "IfcWall", "W1")], "EF_25_10"), el(f, "IfcWall")), spec([W(), ids.Classification(system="Uniclass")], [NAME()])),
    ("classification", "pass", "the_type_passes_its_classification_down", lambda f: typed(f, code="EF_25_10"),
     spec([W()], [ids.Classification(system="Uniclass", value="EF_25_10")])),
    ("classification", "fail", "the_occurrence_overrides_the_type_per_system", lambda f: ref(f, [typed(f, code="EF_25_10")], "EF_25_20"),
     spec([W()], [ids.Classification(system="Uniclass", value="EF_25_10")])),
    ("classification", "pass", "ifc2x3_reads_the_item_reference", lambda f: ref(f, [el(f, "IfcWall", "W1")], "EF_25_10"),
     spec([W()], [ids.Classification(system="Uniclass", value="EF_25_10")], version="IFC2X3"), "IFC2X3"),
    ("material", "pass", "a_layer_set_usage_is_read_as_its_set", layer_set_usage, spec([W()], [ids.Material(value="Brick")])),
    ("material", "pass", "the_type_passes_its_material_down", lambda f: typed(f, material="Concrete"), spec([W()], [ids.Material(value="Concrete")])),
    # units: IDS values are SI; a value is converted from the property's own unit, else the project's
    ("property", "pass", "a_length_in_millimetres_is_compared_in_metres", lambda f: measured(f, MM, {"Width": ("IfcLengthMeasure", 914.4)}), spec([W()], [WIDTH()])),
    ("property", "fail", "a_length_in_millimetres_is_not_its_number_in_metres", lambda f: measured(f, MM, {"Width": ("IfcLengthMeasure", 1.0)}), spec([W()], [WIDTH()])),
    ("property", "pass", "a_length_in_feet_is_compared_in_metres",
     lambda f: measured(f, lambda f: [api.unit.add_conversion_based_unit(f, name="foot")], {"Width": ("IfcLengthMeasure", 3.0)}), spec([W()], [WIDTH()])),
    ("property", "pass", "a_property_unit_wins_over_the_project_unit",
     lambda f: measured(f, MM, {"Width": ("IfcLengthMeasure", 1.0)}, own_unit=("Width", lambda f: api.unit.add_si_unit(f, unit_type="LENGTHUNIT"))), spec([W()], [WIDTH()])),
    ("property", "pass", "an_area_quantity_in_square_millimetres_is_compared_in_square_metres",
     lambda f: measured(f, lambda f: [api.unit.add_si_unit(f, unit_type="AREAUNIT", prefix="MILLI")], qtos={"NetSideArea": 2000000.0}),
     spec([W()], [ids.Property(propertySet="Qto_WallBaseQuantities", baseName="NetSideArea", value=R(options={"minInclusive": 1.9, "maxInclusive": 2.1}, base="double"))])),
    # IFC2X3 takes an occurrence's class from its type; multi-value properties: any one value meets the IDS value
    ("entity", "fail", "ifc2x3_an_occurrence_is_also_the_class_its_type_names", typed_2x3,
     spec([ids.Entity(name="IFCWALL")], [ids.Attribute(name="Description")], version="IFC2X3"), "IFC2X3"),
    ("property", "pass", "any_value_of_a_list_property_meets_the_value",
     lambda f: with_prop(f, lambda f: f.createIfcPropertyListValue("Foo", None, [f.createIfcLabel("X"), f.createIfcLabel("Y")], None)),
     spec([W()], [ids.Property(propertySet="Sentinel_Mini", baseName="Foo", value="Y")])),
    ("property", "fail", "no_value_of_an_enumerated_property_meets_the_value",
     lambda f: with_prop(f, lambda f: f.createIfcPropertyEnumeratedValue("Status", None, [f.createIfcLabel("EXISTING")], None)),
     spec([W()], [ids.Property(propertySet="Sentinel_Mini", baseName="Status", value="NEW")])),
    # partOf: voids and fills, containment through an aggregate, any relation, prohibited
    ("partof", "pass", "a_window_in_a_walls_opening_passes_voids_and_fills", in_opening,
     spec([ids.Entity(name="IFCWINDOW")], [ids.PartOf(name="IFCWALL", relation="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT")])),
    ("partof", "fail", "a_window_in_no_opening_fails_voids_and_fills", lambda f: in_opening(f, fill=False),
     spec([ids.Entity(name="IFCWINDOW")], [ids.PartOf(name="IFCWALL", relation="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT")])),
    ("partof", "pass", "a_part_of_a_contained_assembly_is_contained", part_of_assembly,
     spec([ids.Entity(name="IFCBEAM")], [ids.PartOf(name="IFCBUILDINGSTOREY", relation="IFCRELCONTAINEDINSPATIALSTRUCTURE")])),
    ("partof", "pass", "any_relation_walks_up_to_the_building", in_opening, spec([ids.Entity(name="IFCWINDOW")], [ids.PartOf(name="IFCBUILDING")])),
    ("partof", "fail", "a_prohibited_partof_fails_the_part", part_of_assembly,
     spec([ids.Entity(name="IFCBEAM")], [ids.PartOf(name="IFCELEMENTASSEMBLY", relation="IFCRELAGGREGATES", cardinality="prohibited")])),
    ("property", "pass", "a_mass_in_grams_is_compared_in_kilograms",
     lambda f: measured(f, lambda f: [api.unit.add_si_unit(f, unit_type="MASSUNIT")], {"Mass": ("IfcMassMeasure", 2500.0)}),
     spec([W()], [ids.Property(propertySet="Sentinel_Mini", baseName="Mass", value=R(options={"minInclusive": 2.4, "maxInclusive": 2.6}, base="double"))])),
]

wrong = 0
for facet, label, slug, build, s, *version in CASES:
    os.makedirs(f"{OUT}/{facet}", exist_ok=True)
    base = f"{OUT}/{facet}/{label}-{slug}"
    if not os.path.exists(base + ".ifc"):
        model(build, *version).write(base + ".ifc")
        doc = ids.Ids(title=slug.replace("_", " "))
        doc.specifications.append(s)
        assert doc.to_xml(base + ".ids"), f"{base}.ids fails the IDS 1.0 XSD"
    check = ids.open(base + ".ids", validate=True)
    m = ifcopenshell.open(base + ".ifc")  # kept alive while IfcTester reads its entities
    check.validate(m)
    got = "pass" if all(x.status for x in check.specifications) else "fail"
    if got != label:
        wrong += 1
        print(f"IfcTester says {got}: {base}")
print(f"{len(CASES)} cases, {wrong} labels IfcTester disagrees with")
sys.exit(1 if wrong else 0)
