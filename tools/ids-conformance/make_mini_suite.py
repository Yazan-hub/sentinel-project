# Sentinel's own IDS 1.0 mini suite: small IFC + .ids pairs in the buildingSMART test-case layout (<facet>/<pass|fail>-<name>.ids
# + .ifc), built with IfcOpenShell. IfcTester stamps every expected verdict: a case whose IfcTester verdict differs from its name
# stops the build, so the labels are IfcTester's, not ours. Written once and committed (IfcOpenShell writes fresh GUIDs and dates).
#   %APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/make_mini_suite.py tools/ids-conformance/mini
import os, sys
import ifcopenshell, ifcopenshell.api as api
import ifcopenshell.api.project, ifcopenshell.api.root, ifcopenshell.api.pset, ifcopenshell.api.classification, ifcopenshell.api.material
from ifctester import ids

OUT = sys.argv[1]
R = ids.Restriction


def model(build):
    f = api.project.create_file(version="IFC4")
    api.root.create_entity(f, ifc_class="IfcProject", name="Mini")
    build(f)
    return f


def el(f, cls, name=None, pdt=None, psets=None, **attrs):
    e = api.root.create_entity(f, ifc_class=cls, name=name, predefined_type=pdt)
    for k, v in attrs.items():
        setattr(e, k, v)
    for pname, props in (psets or {}).items():
        api.pset.edit_pset(f, pset=api.pset.add_pset(f, product=e, name=pname), properties=props)
    return e


def spec(applicability, requirements, minOccurs=0, maxOccurs="unbounded"):
    s = ids.Specification(name="Mini", minOccurs=minOccurs, maxOccurs=maxOccurs, ifcVersion=["IFC4"])
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
]

wrong = 0
for facet, label, slug, build, s in CASES:
    os.makedirs(f"{OUT}/{facet}", exist_ok=True)
    base = f"{OUT}/{facet}/{label}-{slug}"
    f = model(build)
    f.write(base + ".ifc")
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
