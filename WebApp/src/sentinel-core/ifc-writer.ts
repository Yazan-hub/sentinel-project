// sentinel-core/ifc-writer — PURE TS (no OBC/THREE/DOM). Serializes Sentinel-authored elements to a
// valid IFC4 STEP (IFC-SPF) file: spatial skeleton + typed elements with extruded-box geometry, GUIDs,
// Pset_*Common, and Qto_*BaseQuantities. The quantity-set names + fields are exactly what the 5D/6D
// take-off reads (adapter/fragments-quantities.ts), so baked elements are schedulable, not just visible.
//
// Proven by the Phase A spike (docs/3d-authoring-ifc-spec.md): a hand-written wall parsed in web-ifc
// (tessellated a real mesh) and converted to fragments via the bridge IfcImporter. This generalises that
// to walls/columns/slabs. Direct IFC-SPF (not web-ifc's writer) — dependency-free and fully under control.
//
// Coordinates: input is three.js world space (Y-up, box CENTER); IFC is Z-up. Map (x,y,z)→(x,-z,y);
// rotation about the vertical (three rotation.y = θ) → IFC RefDirection (cos θ, sin θ, 0). Extrusion is
// along +Z (up) by the box's up-dimension, with the placement origin dropped to the element base.

export type BakeKind = "wall" | "column" | "slab" | "door" | "window";

export interface BakeElement {
  kind: BakeKind;
  /** Effective box dimensions in metres, three-local axes: x (length/width), y (height, UP), z (depth/thickness). */
  size: { x: number; y: number; z: number };
  /** World position of the box CENTRE (three, Y-up). */
  position: [number, number, number];
  /** Rotation about the vertical axis, radians (three rotation.y). */
  rotationY: number;
  /** ObjectType — drives cost/carbon rate/factor matching by category:type. */
  typeName?: string;
  name?: string;
  tag?: string;
  /** MA-3d2 Next: a slab's true outline — points in the element's local plan frame (metres, relative to `position`; local x along
   *  rotationY, local y the horizontal normal = IFC profile Y), at least 3. The rectangle `size.x × size.z` is drawn when absent. */
  footprint?: [number, number][];
}

interface KindDef {
  entity: string;
  predef: string;
  pset: string;
  qto: string;
  quantities: (s: { x: number; y: number; z: number }, fp?: [number, number][]) => string[]; // IFC quantity bodies (without id)
  /** The entity's attributes after PredefinedType's slot is reached — a door's or window's OverallHeight/Width and operation. */
  tail?: (s: { x: number; y: number; z: number }) => string;
}

/** Shoelace area and perimeter of a closed polygon (the first point not repeated). */
export function polygonMeasures(fp: [number, number][]): { area: number; perimeter: number } {
  let a2 = 0, per = 0;
  for (let i = 0; i < fp.length; i++) {
    const [x0, y0] = fp[i], [x1, y1] = fp[(i + 1) % fp.length];
    a2 += x0 * y1 - x1 * y0;
    per += Math.hypot(x1 - x0, y1 - y0);
  }
  return { area: Math.abs(a2) / 2, perimeter: per };
}

// Number → IFC real (always a decimal point).
const R = (x: number): string => {
  if (!Number.isFinite(x)) return "0.";
  const s = String(x);
  return s.includes(".") || s.includes("e") || s.includes("E") ? s : s + ".";
};

const KINDS: Record<BakeKind, KindDef> = {
  wall: {
    entity: "IFCWALLSTANDARDCASE",
    predef: ".STANDARD.",
    pset: "Pset_WallCommon",
    qto: "Qto_WallBaseQuantities",
    quantities: (s) => [
      `IFCQUANTITYLENGTH('Length',$,$,${R(s.x)},$)`,
      `IFCQUANTITYLENGTH('Height',$,$,${R(s.y)},$)`,
      `IFCQUANTITYLENGTH('Width',$,$,${R(s.z)},$)`,
      `IFCQUANTITYAREA('NetSideArea',$,$,${R(s.x * s.y)},$)`,
      `IFCQUANTITYVOLUME('NetVolume',$,$,${R(s.x * s.y * s.z)},$)`,
    ],
  },
  column: {
    entity: "IFCCOLUMN",
    predef: ".COLUMN.",
    pset: "Pset_ColumnCommon",
    qto: "Qto_ColumnBaseQuantities",
    quantities: (s) => [
      `IFCQUANTITYLENGTH('Length',$,$,${R(s.y)},$)`,
      `IFCQUANTITYAREA('CrossSectionArea',$,$,${R(s.x * s.z)},$)`,
      `IFCQUANTITYAREA('OuterSurfaceArea',$,$,${R(2 * (s.x + s.z) * s.y)},$)`,
      `IFCQUANTITYVOLUME('NetVolume',$,$,${R(s.x * s.y * s.z)},$)`,
    ],
  },
  slab: {
    entity: "IFCSLAB",
    predef: ".FLOOR.",
    pset: "Pset_SlabCommon",
    qto: "Qto_SlabBaseQuantities",
    quantities: (s, fp) => {
      const m = fp ? polygonMeasures(fp) : { area: s.x * s.z, perimeter: 2 * (s.x + s.z) };
      return [
        `IFCQUANTITYLENGTH('Width',$,$,${R(s.x)},$)`,
        `IFCQUANTITYLENGTH('Depth',$,$,${R(s.z)},$)`,
        `IFCQUANTITYLENGTH('Perimeter',$,$,${R(m.perimeter)},$)`,
        `IFCQUANTITYAREA('NetArea',$,$,${R(m.area)},$)`,
        `IFCQUANTITYVOLUME('NetVolume',$,$,${R(m.area * s.y)},$)`,
      ];
    },
  },
  // MA-3d2 Next: a door or window as its opening's box (width × height × the host's thickness), unhosted here — a proposal
  // model's view, not a wall opening. IFC4 IFCDOOR/IFCWINDOW take OverallHeight, OverallWidth before PredefinedType.
  door: {
    entity: "IFCDOOR",
    predef: ".DOOR.,.NOTDEFINED.,$",
    pset: "Pset_DoorCommon",
    qto: "Qto_DoorBaseQuantities",
    quantities: (s) => [
      `IFCQUANTITYLENGTH('Width',$,$,${R(s.x)},$)`,
      `IFCQUANTITYLENGTH('Height',$,$,${R(s.y)},$)`,
      `IFCQUANTITYAREA('Area',$,$,${R(s.x * s.y)},$)`,
    ],
    tail: (s) => `${R(s.y)},${R(s.x)},`,
  },
  window: {
    entity: "IFCWINDOW",
    predef: ".WINDOW.,.NOTDEFINED.,$",
    pset: "Pset_WindowCommon",
    qto: "Qto_WindowBaseQuantities",
    quantities: (s) => [
      `IFCQUANTITYLENGTH('Width',$,$,${R(s.x)},$)`,
      `IFCQUANTITYLENGTH('Height',$,$,${R(s.y)},$)`,
      `IFCQUANTITYAREA('Area',$,$,${R(s.x * s.y)},$)`,
    ],
    tail: (s) => `${R(s.y)},${R(s.x)},`,
  },
};

// ── IFC compressed GUID (22-char, IFC base64 alphabet) ───────────────────────
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid(): string {
  const hex = globalThis.crypto.randomUUID().replace(/-/g, "");
  let n = BigInt("0x" + hex);
  let s = "";
  for (let i = 0; i < 21; i++) { s = B64[Number(n & 63n)] + s; n >>= 6n; }
  s = B64[Number(n & 3n)] + s;
  return s;
}

/** Serialize authored elements to an IFC4 STEP file. Returns the .ifc text. */
export function buildIfc(
  elements: BakeElement[],
  opts: { projectName?: string; timestamp?: number } = {},
): string {
  const projectName = opts.projectName ?? "Sentinel Model";
  const ts = opts.timestamp ?? 0;

  const lines: string[] = [];
  let id = 0;
  const add = (body: string): string => { const i = ++id; lines.push(`#${i}= ${body};`); return `#${i}`; };
  const g = () => ifcGuid();

  // owner history
  const person = add(`IFCPERSON($,'Sentinel',$,$,$,$,$,$)`);
  const org = add(`IFCORGANIZATION($,'Sentinel',$,$,$)`);
  const pao = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = add(`IFCAPPLICATION(${org},'1.0','Sentinel Model','SENTINEL')`);
  const owner = add(`IFCOWNERHISTORY(${pao},${app},$,.ADDED.,$,${pao},${app},${ts})`);

  // units
  const uLen = add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const uArea = add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const uVol = add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
  const uAng = add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const units = add(`IFCUNITASSIGNMENT((${uLen},${uArea},${uVol},${uAng}))`);

  // shared geometric context
  const origin = add(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const zdir = add(`IFCDIRECTION((0.,0.,1.))`);
  const xdir = add(`IFCDIRECTION((1.,0.,0.))`);
  const worldCS = add(`IFCAXIS2PLACEMENT3D(${origin},${zdir},${xdir})`);
  const trueNorth = add(`IFCDIRECTION((0.,1.))`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.00001,${worldCS},${trueNorth})`);

  // spatial structure
  const project = add(`IFCPROJECT('${g()}',${owner},${S(projectName)},$,$,$,$,(${ctx}),${units})`);
  const sitePl = add(`IFCLOCALPLACEMENT($,${worldCS})`);
  const site = add(`IFCSITE('${g()}',${owner},'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldgPl = add(`IFCLOCALPLACEMENT(${sitePl},${worldCS})`);
  const bldg = add(`IFCBUILDING('${g()}',${owner},'Building',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$)`);
  const storeyPl = add(`IFCLOCALPLACEMENT(${bldgPl},${worldCS})`);
  const storey = add(`IFCBUILDINGSTOREY('${g()}',${owner},'Level 0',$,$,${storeyPl},$,$,.ELEMENT.,0.)`);
  add(`IFCRELAGGREGATES('${g()}',${owner},$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES('${g()}',${owner},$,$,${site},(${bldg}))`);
  add(`IFCRELAGGREGATES('${g()}',${owner},$,$,${bldg},(${storey}))`);

  const elementIds: string[] = [];
  let seq = 0;

  for (const el of elements) {
    const def = KINDS[el.kind];
    const s = el.size;
    seq++;

    // placement: origin at element BASE (drop the box centre by half its up-dimension).
    // three (x,y,z) centre → IFC (x, -z, y_base); RefDirection = (cosθ, sinθ, 0).
    const [px, py, pz] = el.position;
    const baseZ = py - s.y / 2;
    const cosT = Math.cos(el.rotationY);
    const sinT = Math.sin(el.rotationY);
    const loc = add(`IFCCARTESIANPOINT((${R(px)},${R(-pz)},${R(baseZ)}))`);
    const refDir = add(`IFCDIRECTION((${R(cosT)},${R(sinT)},0.))`);
    const axis = add(`IFCAXIS2PLACEMENT3D(${loc},${zdir},${refDir})`);
    const placement = add(`IFCLOCALPLACEMENT(${storeyPl},${axis})`);

    // geometry: the footprint — a rectangle (local X × Z) or the element's own closed polygon — extruded +Z by the up-dimension (local Y).
    const fp = el.footprint && el.footprint.length >= 3 ? el.footprint : undefined;
    let profile: string;
    if (fp) {
      const pts = fp.map(([x, y]) => add(`IFCCARTESIANPOINT((${R(x)},${R(y)}))`));
      const poly = add(`IFCPOLYLINE((${[...pts, pts[0]].join(",")}))`);
      profile = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,${S(el.kind)},${poly})`);
    } else {
      const p2d = add(`IFCCARTESIANPOINT((0.,0.))`);
      const x2d = add(`IFCDIRECTION((1.,0.))`);
      const profPos = add(`IFCAXIS2PLACEMENT2D(${p2d},${x2d})`);
      profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,${S(el.kind)},${profPos},${R(s.x)},${R(s.z)})`);
    }
    const extrudePos = add(`IFCAXIS2PLACEMENT3D(${origin},${zdir},${xdir})`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${extrudePos},${zdir},${R(s.y)})`);
    const shapeRep = add(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${solid}))`);
    const prodShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`);

    const name = S(el.name ?? `${cap(el.kind)} ${seq}`);
    const objType = S(el.typeName ?? `Sentinel ${cap(el.kind)}`);
    const tag = S(el.tag ?? `${el.kind.toUpperCase().slice(0, 2)}-${String(seq).padStart(2, "0")}`);
    const elem = add(`${def.entity}('${g()}',${owner},${name},$,${objType},${placement},${prodShape},${tag},${def.tail?.(s) ?? ""}${def.predef})`);
    elementIds.push(elem);

    // quantities (schedulable) + common Pset
    const qIds = def.quantities(s, fp).map((q) => add(q));
    const qset = add(`IFCELEMENTQUANTITY('${g()}',${owner},${S(def.qto)},$,$,(${qIds.join(",")}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${g()}',${owner},$,$,(${elem}),${qset})`);

    const pExt = add(`IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$)`);
    const pset = add(`IFCPROPERTYSET('${g()}',${owner},${S(def.pset)},$,(${pExt}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${g()}',${owner},$,$,(${elem}),${pset})`);
  }

  if (elementIds.length) {
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${g()}',${owner},$,$,(${elementIds.join(",")}),${storey})`);
  }

  const header =
    "ISO-10303-21;\n" +
    "HEADER;\n" +
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\n" +
    `FILE_NAME('sentinel-model.ifc','${iso(ts)}',(''),(''),'Sentinel Model','Sentinel','');\n` +
    "FILE_SCHEMA(('IFC4'));\n" +
    "ENDSEC;\n" +
    "DATA;\n";
  return header + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
}

// IFC string literal: single-quote wrap, escape embedded single quotes (IFC doubles them).
const S = (v: string): string => `'${(v ?? "").replace(/'/g, "''")}'`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
// Fixed epoch-based ISO stamp (timestamp is passed in; avoids a nondeterministic Date in a pure module).
const iso = (t: number): string => new Date(t * 1000).toISOString().replace(/\.\d+Z$/, "");
