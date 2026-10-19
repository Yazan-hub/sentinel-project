// BCF-XML files (.bcf / .bcfzip) in and out — the file half of the "work alongside" round trip (spec
// docs/superpowers/specs/2026-10-19-work-alongside-connectors.md). Pure: bytes in, topics out, and back.
//
// Reads BCF-XML 2.1 and 3.0 (a 2.0 file is refused in words); writes 2.1 (what ACC's Issues import takes) and 3.0. A written
// file follows its version's schema: what one version requires and the topic lacks is filled with the value Sentinel means
// (2.1 Visibility shown, 3.0 AspectRatio, TopicType/Status, Title), and what it cannot carry is listed in `lost`. Topics come out in the BCF-API JSON
// shape the store, the web Issues panel and Revit's BcfSyncManager already use, plus the fields BCF-XML has and the API has
// not. Field names that start with x_ carry what the file needs to be written back as it came (file names, a
// VisualizationInfo guid that differs from its viewpoint's, elements this reader does not know). Embedded files (snapshots,
// bitmaps, documents, snippets) travel as base64, so a topic is plain JSON the jsonb column holds.
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { posix } from "node:path";
import { randomUUID } from "node:crypto";

// ---------- XML: a small ordered tree ----------
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: "", parseTagValue: false,
  parseAttributeValue: false, trimValues: false, ignoreDeclaration: true, ignorePiTags: true, commentPropName: "#comment" });

/** XML text → { name, attrs, children, text } (whitespace between elements dropped, comments dropped). */
export function parseXml(text) {
  const conv = (o) => {
    const name = Object.keys(o).find((k) => k !== ":@");
    const raw = o[name] || [];
    const nodes = raw.filter((c) => !("#comment" in c));
    const els = nodes.filter((c) => !("#text" in c)).map(conv);
    const text = nodes.filter((c) => "#text" in c).map((c) => String(c["#text"])).join("");
    return { name, attrs: { ...(o[":@"] || {}) }, children: els, text: els.length ? (text.trim() ? text : "") : text };
  };
  const top = parser.parse(text.replace(/^﻿/, "")).filter((o) => !("#comment" in o) && !("#text" in o));
  if (!top.length) throw Object.assign(new Error("not an XML document"), { status: 400 });
  return conv(top[0]);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** { name, attrs, children, text } → XML text. Attributes with an undefined/null value are left out. */
export function emitXml(node, depth = 0) {
  const pad = "  ".repeat(depth);
  const attrs = Object.entries(node.attrs || {}).filter(([, v]) => v != null).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  const kids = (node.children || []).filter(Boolean);
  if (kids.length) return `${pad}<${node.name}${attrs}>\n${kids.map((c) => emitXml(c, depth + 1)).join("\n")}\n${pad}</${node.name}>`;
  if (node.text != null && node.text !== "") return `${pad}<${node.name}${attrs}>${esc(node.text)}</${node.name}>`;
  return `${pad}<${node.name}${attrs}/>`;
}
const doc = (root) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${emitXml(root)}\n`;
const XSI = { "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", "xmlns:xsd": "http://www.w3.org/2001/XMLSchema" };

const kid = (n, name) => n?.children.find((c) => c.name === name);
const kids = (n, name) => n?.children.filter((c) => c.name === name) ?? [];
const txt = (n, name) => { const k = kid(n, name); return k && k.text !== "" ? k.text : undefined; }; // empty text is unset
const num = (s) => (s == null || s === "" ? undefined : Number(s));
const bool = (s) => (s == null ? undefined : String(s).toLowerCase() === "true");
const attr = (n, ...names) => { for (const a of names) if (n?.attrs[a] != null) return n.attrs[a]; return undefined; };
/** Drop undefined keys, so a read is deep-comparable. */
const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
const E = (name, attrs, children, text) => ({ name, attrs: attrs || {}, children: (children || []).filter(Boolean), text });
// An empty value is no element: Sentinel keeps "" for an unset assignee, stage or description, and an empty <DueDate/> is not a date.
const T = (name, value) => (value == null || value === "" ? null : E(name, {}, [], String(value)));
// The web keeps a snapshot as a data URL; the file holds the bytes.
const bytesOf = (b64) => Buffer.from(String(b64).replace(/^data:[^,]*,/, ""), "base64");
const unknown = (n, known) => { const u = n.children.filter((c) => !known.includes(c.name)); return u.length ? u : undefined; };

// ---------- visualization (.bcfv) ----------
const xyz = (n) => (n ? { x: num(txt(n, "X")), y: num(txt(n, "Y")), z: num(txt(n, "Z")) } : undefined);
const XYZ = (name, p) => (p ? E(name, {}, [T("X", p.x), T("Y", p.y), T("Z", p.z)]) : null);
const readComp = (c) => clean({ ifc_guid: attr(c, "IfcGuid"), originating_system: txt(c, "OriginatingSystem"), authoring_tool_id: txt(c, "AuthoringToolId") });
const Comp = (c) => E("Component", { IfcGuid: c.ifc_guid }, [T("OriginatingSystem", c.originating_system), T("AuthoringToolId", c.authoring_tool_id)]);
const readHints = (h) => (h ? clean({ spaces_visible: bool(h.attrs.SpacesVisible), space_boundaries_visible: bool(h.attrs.SpaceBoundariesVisible), openings_visible: bool(h.attrs.OpeningsVisible) }) : undefined);
const Hints = (h) => (h ? E("ViewSetupHints", { SpacesVisible: h.spaces_visible, SpaceBoundariesVisible: h.space_boundaries_visible, OpeningsVisible: h.openings_visible }) : null);

function readCamera(n) {
  if (!n) return undefined;
  return clean({ camera_view_point: xyz(kid(n, "CameraViewPoint")), camera_direction: xyz(kid(n, "CameraDirection")), camera_up_vector: xyz(kid(n, "CameraUpVector")),
    field_of_view: num(txt(n, "FieldOfView")), view_to_world_scale: num(txt(n, "ViewToWorldScale")), aspect_ratio: num(txt(n, "AspectRatio")) });
}
// ponytail: 3.0 requires a camera's aspect ratio; one that never had it (a 2.1 file's, an older Sentinel viewpoint's) gets a
// common screen's. The web viewer now records its own.
const DEFAULT_ASPECT = 16 / 9;
function Camera(name, c, v3, lost, where) {
  if (!c) return null;
  if (!v3 && c.aspect_ratio != null) lost.add(`${where}: camera aspect ratio (BCF 2.1 has none)`);
  let fov = c.field_of_view;
  if (!v3 && name === "PerspectiveCamera" && fov != null && (fov < 45 || fov > 60)) { // 2.1's schema allows 45–60°
    lost.add(`${where}: a field of view of ${Math.round(fov * 10) / 10}° (BCF 2.1 allows 45–60°; written as ${fov < 45 ? 45 : 60}°)`);
    fov = fov < 45 ? 45 : 60;
  }
  return E(name, {}, [XYZ("CameraViewPoint", c.camera_view_point), XYZ("CameraDirection", c.camera_direction), XYZ("CameraUpVector", c.camera_up_vector),
    // A perspective camera has a field of view, an orthogonal one a scale — never the other's.
    name === "PerspectiveCamera" ? T("FieldOfView", fov) : T("ViewToWorldScale", c.view_to_world_scale),
    v3 ? T("AspectRatio", c.aspect_ratio ?? DEFAULT_ASPECT) : null]);
}

/** A .bcfv → the viewpoint's visual fields (BCF-API names). `file(ref)` returns an embedded file's bytes or undefined. */
export function readVisualization(xml, file = () => undefined) {
  const n = typeof xml === "string" ? parseXml(xml) : xml;
  const v = {};
  if (n.attrs.Guid) v.x_vi_guid = n.attrs.Guid;
  const comps = kid(n, "Components");
  if (comps) {
    const c = {};
    const sel = kid(comps, "Selection");
    const nonEmpty = (xs) => (xs.length ? xs : undefined); // an empty list is no list: 2.1 allows none, 3.0 writes them freely
    c.selection = nonEmpty(kids(sel, "Component").map(readComp));
    const vis = kid(comps, "Visibility");
    const hints = readHints(kid(vis, "ViewSetupHints") || kid(comps, "ViewSetupHints"));
    if (vis || hints) {
      c.visibility = clean({ default_visibility: bool(vis?.attrs.DefaultVisibility), view_setup_hints: hints,
        exceptions: nonEmpty(kids(kid(vis, "Exceptions"), "Component").map(readComp)) });
      if (!vis) c.x_no_visibility = true;
    }
    const col = kid(comps, "Coloring");
    c.coloring = nonEmpty(kids(col, "Color").map((k) => ({ color: k.attrs.Color, components: kids(kid(k, "Components") ?? k, "Component").map(readComp) }))); // 3.0 wraps them
    c.x_xml = unknown(comps, ["Selection", "Visibility", "Coloring", "ViewSetupHints"]);
    v.components = clean(c);
  }
  v.orthogonal_camera = readCamera(kid(n, "OrthogonalCamera"));
  v.perspective_camera = readCamera(kid(n, "PerspectiveCamera"));
  const lines = kid(n, "Lines");
  const ls = kids(lines, "Line").map((l) => ({ start_point: xyz(kid(l, "StartPoint")), end_point: xyz(kid(l, "EndPoint")) }));
  if (ls.length) v.lines = ls;
  const planes = kid(n, "ClippingPlanes");
  const ps = kids(planes, "ClippingPlane").map((p) => ({ location: xyz(kid(p, "Location")), direction: xyz(kid(p, "Direction")) }));
  if (ps.length) v.clipping_planes = ps;
  const bms = kid(n, "Bitmaps") ? kids(kid(n, "Bitmaps"), "Bitmap") : kids(n, "Bitmap"); // 3.0 wraps them; 2.1 lists them
  if (bms.length || kid(n, "Bitmaps")) v.bitmaps = bms.map((b) => {
    const ref = txt(b, "Reference"); const data = file(ref);
    return clean({ bitmap_type: (txt(b, "Format") ?? txt(b, "Bitmap"))?.toLowerCase(), x_file: ref, bitmap_data: data ? Buffer.from(data).toString("base64") : undefined,
      location: xyz(kid(b, "Location")), normal: xyz(kid(b, "Normal")), up: xyz(kid(b, "Up")), height: num(txt(b, "Height")) });
  });
  v.x_xml = unknown(n, ["Components", "OrthogonalCamera", "PerspectiveCamera", "Lines", "ClippingPlanes", "Bitmaps", "Bitmap"]);
  return clean(v);
}

function Visualization(vp, v3, put, folder, lost, where) {
  const c = vp.components;
  const exc = c?.visibility?.exceptions;
  const vis = c?.visibility && !c.x_no_visibility
    ? E("Visibility", { DefaultVisibility: c.visibility.default_visibility }, [v3 ? Hints(c.visibility.view_setup_hints) : null, exc?.length ? E("Exceptions", {}, exc.map(Comp)) : null])
    : null;
  const comps = c ? E("Components", {}, [
    v3 ? null : Hints(c.visibility?.view_setup_hints),
    c.selection?.length ? E("Selection", {}, c.selection.map(Comp)) : null,
    vis ?? (v3 ? null : E("Visibility", { DefaultVisibility: true })), // 2.1 requires it: Sentinel's viewpoints show the model, the selection lit
    c.coloring?.length ? E("Coloring", {}, c.coloring.map((k) => E("Color", { Color: k.color }, v3 ? [E("Components", {}, k.components.map(Comp))] : k.components.map(Comp)))) : null,
    ...(c.x_xml || [])]) : null;
  const bitmaps = (vp.bitmaps || []).map((b, i) => {
    const ref = b.x_file || `bitmap_${vp.guid}_${i}.${b.bitmap_type || "png"}`;
    if (b.bitmap_data != null) put(posix.join(folder, ref), bytesOf(b.bitmap_data));
    return E("Bitmap", {}, [v3 ? T("Format", (b.bitmap_type || "png").toLowerCase()) : T("Bitmap", (b.bitmap_type || "png").toUpperCase()), T("Reference", ref),
      XYZ("Location", b.location), XYZ("Normal", b.normal), XYZ("Up", b.up), T("Height", b.height)]);
  });
  const line = (l) => E("Line", {}, [XYZ("StartPoint", l.start_point), XYZ("EndPoint", l.end_point)]);
  const plane = (p) => E("ClippingPlane", {}, [XYZ("Location", p.location), XYZ("Direction", p.direction)]);
  return E("VisualizationInfo", { ...XSI, Guid: vp.x_vi_guid || vp.guid }, [
    comps,
    // 3.0 holds exactly one camera (Markup leaves out a viewpoint file that has none); a 2.1 viewpoint with both keeps its perspective one.
    v3 && vp.perspective_camera && vp.orthogonal_camera ? (lost.add(`${where}: viewpoint ${vp.guid}'s orthogonal camera (BCF 3.0 holds one camera; the perspective one was kept)`), null)
      : Camera("OrthogonalCamera", vp.orthogonal_camera, v3, lost, where),
    Camera("PerspectiveCamera", vp.perspective_camera, v3, lost, where),
    // No empty list: 2.1 wants at least one entry, and in 3.0 an empty list says nothing.
    vp.lines?.length ? E("Lines", {}, vp.lines.map(line)) : null,
    vp.clipping_planes?.length ? E("ClippingPlanes", {}, vp.clipping_planes.map(plane)) : null,
    ...(v3 ? [vp.bitmaps ? E("Bitmaps", {}, bitmaps) : null] : bitmaps),
    ...(vp.x_xml || [])]);
}

// ---------- markup ----------
const TOPIC_KNOWN = ["ReferenceLink", "ReferenceLinks", "Title", "Priority", "Index", "Labels", "CreationDate", "CreationAuthor", "ModifiedDate", "ModifiedAuthor",
  "DueDate", "AssignedTo", "Stage", "Description", "BimSnippet", "DocumentReference", "DocumentReferences", "RelatedTopic", "RelatedTopics", "Comments", "Viewpoints"];
const COMMENT_KNOWN = ["Date", "Author", "Comment", "Viewpoint", "ModifiedDate", "ModifiedAuthor"];

function readComment(c) {
  return clean({ guid: c.attrs.Guid, date: txt(c, "Date"), author: txt(c, "Author"), comment: txt(c, "Comment") ?? "",
    viewpoint_guid: kid(c, "Viewpoint")?.attrs.Guid, modified_date: txt(c, "ModifiedDate"), modified_author: txt(c, "ModifiedAuthor"),
    x_xml: unknown(c, COMMENT_KNOWN) });
}
const Comment = (c, v3) => E("Comment", { Guid: c.guid }, [T("Date", c.date), T("Author", c.author), v3 ? T("Comment", c.comment) : E("Comment", {}, [], c.comment ?? ""),
  c.viewpoint_guid ? E("Viewpoint", { Guid: c.viewpoint_guid }) : null, T("ModifiedDate", c.modified_date), T("ModifiedAuthor", c.modified_author), ...(c.x_xml || [])]);

/** One topic folder → a topic. `read(path)` returns a zip entry's bytes (paths from the zip root) or undefined. */
function readTopic(markupXml, folder, read, docs) {
  const m = parseXml(markupXml);
  const t = kid(m, "Topic");
  if (!t) throw Object.assign(new Error(`${folder}/markup.bcf has no Topic — nothing was imported`), { status: 400 });
  const rel = (ref) => (ref == null ? undefined : posix.normalize(posix.join(folder, ref)));
  const b64 = (p) => { const d = p && read(p); return d ? Buffer.from(d).toString("base64") : undefined; };
  const header = kid(m, "Header");
  const files = header ? (kid(header, "Files") ? kids(kid(header, "Files"), "File") : kids(header, "File")).map((f) => clean({
    ifc_project: f.attrs.IfcProject, ifc_spatial_structure_element: f.attrs.IfcSpatialStructureElement, is_external: bool(attr(f, "IsExternal", "isExternal")),
    filename: txt(f, "Filename"), date: txt(f, "Date"), reference: txt(f, "Reference") })) : [];
  const snip = kid(t, "BimSnippet");
  const snipExternal = bool(attr(snip, "IsExternal", "isExternal"));
  const snipFile = snip && !snipExternal ? (() => { const p = rel(txt(snip, "Reference")); const d = b64(p); return d ? { path: p, data: d } : undefined; })() : undefined;
  const docRefs = (kid(t, "DocumentReferences") ? kids(kid(t, "DocumentReferences"), "DocumentReference") : kids(t, "DocumentReference")).map((d) => {
    const ext = bool(attr(d, "IsExternal", "isExternal"));
    const path = txt(d, "ReferencedDocument");
    const dg = txt(d, "DocumentGuid");
    const r = clean({ guid: d.attrs.Guid, document_guid: dg, url: txt(d, "Url"), referenced_document: path, is_external: ext, description: txt(d, "Description") });
    if (path != null && !ext) { const data = b64(rel(path)); if (data) r.x_file = { path: rel(path), data }; }
    if (dg && docs[dg]) r.x_document = clean({ ...docs[dg], data: b64(`documents/${dg}`) });
    return r;
  });
  const vpNodes = kid(t, "Viewpoints") ? kids(kid(t, "Viewpoints"), "ViewPoint") : kids(m, "Viewpoints");
  const viewpoints = vpNodes.map((vn) => {
    const file = txt(vn, "Viewpoint"), snap = txt(vn, "Snapshot");
    const vxml = file != null && read(rel(file));
    const vis = vxml ? readVisualization(strFromU8(vxml), (ref) => read(rel(ref))) : {};
    const sdata = snap != null ? b64(rel(snap)) : undefined;
    // The store, the web and openCDE keep a snapshot as a data URL; the file's own name rides beside it.
    const vp = clean({ guid: vn.attrs.Guid, index: num(txt(vn, "Index")), x_file: file, ...vis, x_snapshot_file: snap,
      snapshot: sdata != null ? `data:${/\.jpe?g$/i.test(snap) ? "image/jpeg" : "image/png"};base64,${sdata}` : undefined });
    if (vp.x_vi_guid === vp.guid) delete vp.x_vi_guid;
    return vp;
  });
  const labelsWrap = kid(t, "Labels") && kid(kid(t, "Labels"), "Label");
  const labels = labelsWrap ? kids(kid(t, "Labels"), "Label").map((l) => l.text) : kids(t, "Labels").map((l) => l.text).filter((s) => s !== "");
  const links = kid(t, "ReferenceLinks") ? kids(kid(t, "ReferenceLinks"), "ReferenceLink").map((l) => l.text) : kids(t, "ReferenceLink").map((l) => l.text);
  const related = (kid(t, "RelatedTopics") ? kids(kid(t, "RelatedTopics"), "RelatedTopic") : kids(t, "RelatedTopic")).map((r) => r.attrs.Guid); // the store's shape: GUIDs
  const commentNodes = kid(t, "Comments") ? kids(kid(t, "Comments"), "Comment") : kids(m, "Comment");
  return clean({
    guid: t.attrs.Guid, server_assigned_id: t.attrs.ServerAssignedId, topic_type: t.attrs.TopicType, topic_status: t.attrs.TopicStatus,
    reference_links: links.length ? links : undefined, title: txt(t, "Title") ?? "", priority: txt(t, "Priority"), index: num(txt(t, "Index")),
    labels: labels.length ? labels : undefined, creation_date: txt(t, "CreationDate"), creation_author: txt(t, "CreationAuthor"),
    modified_date: txt(t, "ModifiedDate"), modified_author: txt(t, "ModifiedAuthor"), due_date: txt(t, "DueDate"), assigned_to: txt(t, "AssignedTo"),
    stage: txt(t, "Stage"), description: txt(t, "Description"),
    bim_snippet: snip ? clean({ snippet_type: snip.attrs.SnippetType, is_external: snipExternal, reference: txt(snip, "Reference"),
      reference_schema: txt(snip, "ReferenceSchema"), x_file: snipFile }) : undefined,
    document_references: docRefs.length ? docRefs : undefined, related_topics: related.length ? related : undefined,
    comments: commentNodes.map(readComment), viewpoints, files: files.length ? files : undefined,
    x_folder: folder !== t.attrs.Guid ? folder : undefined, x_xml: unknown(t, TOPIC_KNOWN), x_markup_xml: unknown(m, ["Header", "Topic", "Comment", "Viewpoints"]),
  });
}

function Markup(t, v3, put, docs, lost, fill = v3, has = () => true) {
  const folder = t.x_folder ?? t.guid;
  const where = `topic ${t.guid}`;
  const L = (cond, what) => { if (cond) lost.add(`${where}: ${what}`); };
  const ext = v3 ? "IsExternal" : "isExternal";
  // A model file the issue says is inside the package (isExternal false) is written so only when it is: Sentinel keeps models in
  // its CDE, not inside an issue, so a model embedded in an imported file is written as a reference (and said) — a reader that
  // trusts the flag would otherwise look for a file that is not there.
  const files = (t.files || []).map((f) => {
    const inside = f.is_external === false && f.reference != null && has(posix.normalize(posix.join(folder, f.reference)));
    if (f.is_external === false && !inside) L(true, `the model file "${f.filename ?? f.reference}" (Sentinel keeps models in its CDE, not inside an issue — written as a reference)`);
    return E("File", { IfcProject: f.ifc_project, IfcSpatialStructureElement: f.ifc_spatial_structure_element, [ext]: f.is_external === false && !inside ? true : f.is_external },
      [T("Filename", f.filename), T("Date", f.date), T("Reference", f.reference)]);
  });
  const header = files.length ? E("Header", {}, v3 ? [E("Files", {}, files)] : files) : null;
  const putFile = (x) => { if (x?.data != null) put(x.path, Buffer.from(x.data, "base64")); };
  if (t.bim_snippet) putFile(t.bim_snippet.x_file);
  const snip = t.bim_snippet ? E("BimSnippet", { SnippetType: t.bim_snippet.snippet_type, [ext]: t.bim_snippet.is_external },
    [T("Reference", t.bim_snippet.reference), T("ReferenceSchema", t.bim_snippet.reference_schema)]) : null;
  const refs = (t.document_references || []).map((d) => {
    if (v3) {
      let dg = d.document_guid;
      if (!dg && d.x_file) { dg = randomUUID(); docs[dg] = { filename: posix.basename(d.x_file.path), data: d.x_file.data }; }
      else if (dg && d.x_document) docs[dg] = d.x_document;
      const url = d.url ?? (d.is_external ? d.referenced_document : undefined);
      L(!dg && url == null && d.referenced_document != null, `document reference "${d.referenced_document}" (its file was not in the package)`);
      return E("DocumentReference", { Guid: d.guid || randomUUID() }, [dg ? T("DocumentGuid", dg) : T("Url", url), T("Description", d.description)]);
    }
    putFile(d.x_file);
    let path = d.referenced_document ?? d.url;
    if (path == null && d.x_document) { path = `../documents/${d.x_document.filename}`; if (d.x_document.data != null) put(`documents/${d.x_document.filename}`, Buffer.from(d.x_document.data, "base64")); }
    L(d.document_guid && !d.x_document, `document ${d.document_guid} (its file was not in the package)`);
    return E("DocumentReference", { Guid: d.guid, isExternal: d.is_external ?? (d.url != null ? true : undefined) }, [T("ReferencedDocument", path), T("Description", d.description)]);
  });
  L(!v3 && t.server_assigned_id != null, "server-assigned id (BCF 2.1 has none)");
  const vps = (t.viewpoints || []).map((vp) => {
    // A 3.0 viewpoint file needs a camera: one without (an IDS raise, a Revit plan view) keeps its snapshot, not its file.
    const noCamera = v3 && !vp.perspective_camera && !vp.orthogonal_camera;
    L(noCamera && (vp.components || vp.lines || vp.clipping_planes || vp.bitmaps), `viewpoint ${vp.guid}'s elements and markup (BCF 3.0 needs a camera for them — export as 2.1 to keep them)`);
    const vfile = noCamera ? undefined : vp.x_file ?? `Viewpoint_${vp.guid}.bcfv`;
    if (vfile) put(posix.join(folder, vfile), strToU8(doc(Visualization(vp, v3, put, folder, lost, where))));
    const s = vp.snapshot; // a data URL (the store's), bare base64, or { snapshot_type, snapshot_data, x_file }
    const sdata = typeof s === "string" ? s : s?.snapshot_data;
    const jpg = typeof s === "string" ? /^data:image\/jpe?g/i.test(s) : s?.snapshot_type === "jpg";
    const sfile = vp.x_snapshot_file ?? (typeof s === "object" ? s?.x_file : undefined) ?? (sdata ? `Snapshot_${vp.guid}.${jpg ? "jpg" : "png"}` : undefined);
    if (sdata) put(posix.join(folder, sfile), bytesOf(sdata));
    return E(v3 ? "ViewPoint" : "Viewpoints", { Guid: vp.guid }, [T("Viewpoint", vfile), T("Snapshot", sfile), T("Index", vp.index)]);
  });
  const comments = (t.comments || []).map((c) => Comment(c, v3));
  const wrap = (name, list) => (list.length ? E(name, {}, list) : null);
  const related = (t.related_topics || []).map((r) => E("RelatedTopic", { Guid: typeof r === "string" ? r : r.related_topic_guid }));
  // 3.0 requires a type, a status and a title that is not blank: the topic's, else what Sentinel gives a new topic.
  const topic = E("Topic", { Guid: t.guid, ServerAssignedId: v3 ? t.server_assigned_id : undefined,
    TopicType: fill ? t.topic_type || "Issue" : t.topic_type, TopicStatus: fill ? t.topic_status || "Open" : t.topic_status }, [
    ...(v3 ? [wrap("ReferenceLinks", (t.reference_links || []).map((l) => T("ReferenceLink", l)))] : (t.reference_links || []).map((l) => T("ReferenceLink", l))),
    E("Title", {}, [], fill && !String(t.title ?? "").trim() ? "Untitled" : t.title ?? ""), T("Priority", t.priority), T("Index", t.index),
    ...(v3 ? [wrap("Labels", (t.labels || []).map((l) => T("Label", l)))] : (t.labels || []).map((l) => T("Labels", l))),
    T("CreationDate", t.creation_date), T("CreationAuthor", t.creation_author), T("ModifiedDate", t.modified_date), T("ModifiedAuthor", t.modified_author),
    T("DueDate", t.due_date), T("AssignedTo", t.assigned_to), T("Stage", t.stage), T("Description", t.description), snip,
    ...(v3 ? [wrap("DocumentReferences", refs)] : refs),
    ...(v3 ? [wrap("RelatedTopics", related)] : related),
    ...(v3 ? [wrap("Comments", comments), wrap("Viewpoints", vps)] : []),
    ...(t.x_xml || [])]);
  return E("Markup", XSI, [header, topic, ...(v3 ? [] : comments), ...(v3 ? [] : vps), ...(t.x_markup_xml || [])]);
}

// ---------- the package ----------
/** A path inside a package that stays inside it: relative, no drive or backslash, no ".." part. Pure. */
export const safeZipPath = (p) => typeof p === "string" && p !== "" && !/^[/\\]|[\\:]|^\.\.?$/.test(p) && !posix.normalize(p).split("/").includes("..");
// ponytail: the whole package is unpacked in memory; a cap on what the entries say they unpack to keeps a zip bomb from taking
// the bridge down. Stream entries if real packages ever pass 256 MB.
export const UNZIP_MAX_BYTES = 256 * 1024 * 1024, UNZIP_MAX_ENTRIES = 5000;

/** .bcf/.bcfzip bytes → { version, detailed_version, project, topics, extra_files }. A 400 in words on a file that is not BCF,
 *  a 413 on one that unpacks past the cap, a 400 on an entry whose path leaves the package. */
export function readBcfZip(bytes, { maxBytes = UNZIP_MAX_BYTES } = {}) {
  let z, total = 0, n = 0, over = false;
  try {
    z = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter: (f) => { total += f.originalSize; n++; if (total > maxBytes || n > UNZIP_MAX_ENTRIES) over = true; return !over; } });
  } catch { throw Object.assign(new Error("this file is not a BCF package (a .bcf or .bcfzip is a zip) — nothing was imported"), { status: 400 }); }
  if (over) throw Object.assign(new Error(`this BCF package unpacks to more than ${Math.round(maxBytes / 1048576)} MB or ${UNZIP_MAX_ENTRIES} files — nothing was imported`), { status: 413 });
  const bad = Object.keys(z).find((p) => !safeZipPath(p.replace(/\\/g, "/").replace(/\/$/, ""))); // a Windows tool may write \ for /
  if (bad != null) throw Object.assign(new Error(`this BCF package has a file path that leaves the package ("${bad.slice(0, 80)}") — nothing was imported`), { status: 400 });
  const entries = new Map(Object.entries(z).filter(([p]) => !p.endsWith("/")).map(([p, d]) => [p.replace(/\\/g, "/"), d]));
  const used = new Set();
  const read = (p) => { if (p == null || !entries.has(p)) return undefined; used.add(p); return entries.get(p); };
  const verXml = read("bcf.version");
  const ver = verXml ? parseXml(strFromU8(verXml)) : null;
  if (/^(1|2\.0)/.test(ver?.attrs.VersionId ?? ""))
    throw Object.assign(new Error(`this is a BCF ${ver.attrs.VersionId} file, which Sentinel does not read — export the issues again as BCF 2.1 or 3.0 from the tool they came from; nothing was imported`), { status: 400 });
  const docs = {};
  // documents.xml stays in extra_files (it can list documents no topic references); a referenced document's file goes with its topic.
  const docXml = entries.get("documents.xml");
  if (docXml) for (const d of kids(kid(parseXml(strFromU8(docXml)), "Documents"), "Document"))
    docs[d.attrs.Guid] = clean({ filename: txt(d, "Filename"), description: txt(d, "Description") });
  const projXml = read("project.bcfp");
  let project;
  if (projXml) {
    const p = parseXml(strFromU8(projXml));
    const pn = kid(p, "Project");
    project = clean({ project_id: pn?.attrs.ProjectId, name: txt(pn, "Name"), extension_schema: txt(p, "ExtensionSchema") });
  }
  const topics = [...entries.keys()].filter((p) => /^[^/]+\/markup\.bcf$/i.test(p)).sort()
    .map((p) => readTopic(strFromU8(read(p)), p.split("/")[0], read, docs));
  if (!ver && !topics.length) throw Object.assign(new Error("this zip has no bcf.version and no topic folders — it is not a BCF package; nothing was imported"), { status: 400 });
  const extra_files = {};
  for (const [p, d] of entries) if (!used.has(p)) extra_files[p] = Buffer.from(d).toString("base64");
  return clean({ version: ver?.attrs.VersionId || "2.1", detailed_version: txt(ver, "DetailedVersion"), project, topics, extra_files });
}

/** The model files a package carries inside it for its issues (Header File, isExternal false, found in the zip) — Sentinel does not
 *  keep them with an issue (models live in the CDE), so an import says which. → [{ guid, filename, bytes }]. Pure. */
export function embeddedModels(pkg) {
  const sizes = Object.fromEntries(Object.entries(pkg.extra_files || {}).map(([p, b64]) => [p, Math.floor((b64.length * 3) / 4)]));
  return (pkg.topics || []).flatMap((t) => (t.files || [])
    .filter((f) => f.is_external === false && f.reference != null)
    .map((f) => ({ guid: t.guid, filename: f.filename ?? f.reference, bytes: sizes[posix.normalize(posix.join(t.x_folder ?? t.guid, f.reference))] }))
    .filter((m) => m.bytes != null));
}

const uniq = (xs) => [...new Set(xs.filter((x) => x != null && x !== ""))];
/** ACC's Issues import takes at most this many issues a file (Autodesk Build help, "Import Issues from BCF File"). */
export const ACC_ISSUES_PER_FILE = 100;
/** Topics → { bytes, lost } as BCF-XML `version` ("2.1" | "3.0"). `lost` lists, in words, what this version cannot carry.
 *  `forAcc`: a 2.1 file for ACC's Issues import, which refuses an issue without a status — every topic gets a type, a status and a
 *  title (what Sentinel gives a new topic), as 3.0 always does. Valid 2.1 either way. */
export function writeBcfZip(topics, { version = "2.1", project, extra_files = {}, detailed_version, forAcc = false } = {}) {
  if (version !== "2.1" && version !== "3.0") throw Object.assign(new Error('a BCF export is version "2.1" or "3.0"'), { status: 400 });
  const v3 = version === "3.0";
  const out = {};
  const lost = new Set();
  // Every file goes through here: a path that would leave the package (a stored reference such as "../../x") is not written.
  const put = (p, d) => {
    if (!safeZipPath(p)) { lost.add(`a file at "${String(p).slice(0, 80)}" (its path leaves the package, so it is not written)`); return; }
    out[p] = d instanceof Uint8Array ? d : new Uint8Array(d);
  };
  const docs = {};
  for (const [p, b64] of Object.entries(extra_files)) put(p, Buffer.from(b64, "base64"));
  put("bcf.version", strToU8(doc(E("Version", { ...XSI, VersionId: version }, [v3 ? null : T("DetailedVersion", detailed_version ?? version)]))));
  // A project element only when the package named one (2.1: optional; 3.0: the whole file is optional, its Project needs an id).
  const proj = project && project.project_id != null ? E("Project", { ProjectId: project.project_id }, [T("Name", project.name)]) : null;
  if (project && (proj || !v3)) put("project.bcfp", strToU8(doc(v3
    ? E("ProjectInfo", XSI, [proj])
    : E("ProjectExtension", XSI, [proj, E("ExtensionSchema", {}, [], project.extension_schema ?? "")]))));
  for (const t of topics) put(`${t.x_folder ?? t.guid}/markup.bcf`, strToU8(doc(Markup(t, v3, put, docs, lost, v3 || forAcc, (p) => p in out))));
  if (v3) {
    if (Object.keys(docs).length) { // merged into a documents.xml the package already had
      const had = out["documents.xml"] ? kids(kid(parseXml(strFromU8(out["documents.xml"])), "Documents"), "Document") : [];
      const listed = new Set(had.map((d) => d.attrs.Guid));
      if (Object.keys(docs).some((g) => !listed.has(g))) put("documents.xml", strToU8(doc(E("DocumentInfo", XSI, [E("Documents", {}, [...had.filter((d) => !docs[d.attrs.Guid]), ...Object.entries(docs).map(([g, d]) =>
        E("Document", { Guid: g }, [T("Filename", d.filename), T("Description", d.description)]))])]))));
      for (const [g, d] of Object.entries(docs)) if (d.data != null) put(`documents/${g}`, Buffer.from(d.data, "base64"));
    }
    if (!out["extensions.xml"]) { // 3.0 asks for one: the values these topics use
      const list = (wrap, item, vals) => E(wrap, {}, uniq(vals).map((v) => T(item, v)));
      put("extensions.xml", strToU8(doc(E("Extensions", XSI, [
        list("TopicTypes", "TopicType", topics.map((t) => t.topic_type)), list("TopicStatuses", "TopicStatus", topics.map((t) => t.topic_status)),
        list("Priorities", "Priority", topics.map((t) => t.priority)), list("TopicLabels", "TopicLabel", topics.flatMap((t) => t.labels || [])),
        list("Users", "User", topics.flatMap((t) => [t.assigned_to, t.creation_author, t.modified_author, ...(t.comments || []).flatMap((c) => [c.author, c.modified_author])])),
        list("SnippetTypes", "SnippetType", topics.map((t) => t.bim_snippet?.snippet_type)), list("Stages", "Stage", topics.map((t) => t.stage))]))));
    }
  }
  return { bytes: zipSync(out, { level: 6 }), lost: [...lost] };
}

// ---------- comparison (tests and the drill) ----------
const NS = /^(xmlns(:|$)|xsi:)/;
function norm(n) {
  const attrs = Object.fromEntries(Object.entries(n.attrs).filter(([k]) => !NS.test(k)).map(([k, v]) => [k.toLowerCase() === "isexternal" ? "IsExternal" : k, v]));
  const children = n.children.map(norm).filter((c) => c.children.length || Object.keys(c.attrs).length || (c.text ?? "") !== "");
  return { name: n.name, attrs, children, text: children.length ? "" : n.text ?? "" };
}
const same = (a, b) => {
  if (a === b) return true;
  if (a != null && b != null && String(a).trim() !== "" && String(b).trim() !== "" && !isNaN(a) && !isNaN(b)) return Number(a) === Number(b);
  return typeof a === "string" && typeof b === "string" && /^(true|false)$/i.test(a) && a.toLowerCase() === b.toLowerCase();
};
/** Two XML texts → the differences, as paths in words ([] = the same). Ignores whitespace between elements, comments,
 *  namespace declarations, attribute order, the spelling of numbers and booleans, and empty elements with nothing in them
 *  (an empty <Labels/> is no labels). Children are compared per element name, in order. */
export function diffXml(aText, bText) {
  const out = [];
  const walk = (a, b, path) => {
    if (a.name !== b.name) { out.push(`${path}: <${a.name}> became <${b.name}>`); return; }
    for (const k of new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]))
      if (!same(a.attrs[k], b.attrs[k])) out.push(`${path}/@${k}: "${a.attrs[k]}" became "${b.attrs[k]}"`);
    if (!same(a.text, b.text)) out.push(`${path}: text "${String(a.text).slice(0, 60)}" became "${String(b.text).slice(0, 60)}"`);
    for (const name of new Set([...a.children, ...b.children].map((c) => c.name))) {
      const as = a.children.filter((c) => c.name === name), bs = b.children.filter((c) => c.name === name);
      if (as.length !== bs.length) out.push(`${path}/${name}: ${as.length} became ${bs.length}`);
      for (let i = 0; i < Math.min(as.length, bs.length); i++) walk(as[i], bs[i], `${path}/${name}[${i}]`);
    }
  };
  const a = norm(parseXml(aText)), b = norm(parseXml(bText));
  walk(a, b, a.name);
  return out;
}

/** Two packages → the differences file by file: XML compared with diffXml, other files byte for byte. */
export function diffBcfZip(aBytes, bBytes) {
  const a = unzipSync(aBytes), b = unzipSync(bBytes);
  const files = (z) => Object.keys(z).filter((p) => !p.endsWith("/"));
  const out = [];
  for (const p of new Set([...files(a), ...files(b)])) {
    if (!a[p]) { out.push(`${p}: added`); continue; }
    if (!b[p]) { out.push(`${p}: missing`); continue; }
    if (/\.(bcf|bcfv|bcfp|version|xml)$/i.test(p)) out.push(...diffXml(strFromU8(a[p]), strFromU8(b[p])).map((d) => `${p}: ${d}`));
    else if (Buffer.compare(Buffer.from(a[p]), Buffer.from(b[p])) !== 0) out.push(`${p}: bytes differ`);
  }
  return out;
}

// ---------- import into the store ----------
const MERGED = ["server_assigned_id", "topic_type", "topic_status", "reference_links", "title", "priority", "index", "labels", "modified_date", "modified_author",
  "due_date", "assigned_to", "stage", "description", "bim_snippet", "document_references", "related_topics", "files", "x_folder", "x_xml", "x_markup_xml"];
const SAID = { topic_status: "Status", title: "Title", priority: "Priority", assigned_to: "Assignee", due_date: "Due date" };
const when = (t) => Date.parse(t?.modified_date ?? t?.creation_date ?? "") || 0;
/** A topic read from a file, merged into the stored one with the same GUID (or made new). Comments and viewpoints are added by
 *  GUID, never replaced; the topic's own fields are taken from the file only when the file's copy is newer. Sentinel's own fields
 *  (project, model, history, resolved_by_version) are kept. → { topic, created, changed, fieldChanges } — fieldChanges is what
 *  the governed-topic rule is asked about. */
export function mergeImported(existing, incoming, { pid, now = new Date().toISOString(), actor = "web", model = "" } = {}) {
  const inc = structuredClone(incoming);
  inc.comments ??= []; inc.viewpoints ??= [];
  if (!existing) return { topic: { ...inc, project_id: pid, model, history: [{ date: now, author: actor, action: "Imported from a BCF file" }] }, created: true, changed: true, fieldChanges: {} };
  const t = structuredClone(existing);
  t.comments ??= []; t.viewpoints ??= []; t.history ??= [];
  const said = [];
  const haveC = new Set(t.comments.map((c) => c.guid)), haveV = new Set(t.viewpoints.map((v) => v.guid));
  const newC = inc.comments.filter((c) => !haveC.has(c.guid)), newV = inc.viewpoints.filter((v) => !haveV.has(v.guid));
  t.comments.push(...newC); t.viewpoints.push(...newV);
  if (newC.length) said.push(`${newC.length} comment${newC.length > 1 ? "s" : ""}`);
  if (newV.length) said.push(`${newV.length} viewpoint${newV.length > 1 ? "s" : ""}`);
  const fieldChanges = {};
  if (when(inc) > when(existing)) for (const k of MERGED) {
    if (JSON.stringify(inc[k]) === JSON.stringify(existing[k])) continue;
    if (inc[k] === undefined && (existing[k] === "" || existing[k] === null)) continue; // "" and unset are the same to a file
    if (inc[k] === undefined && (k === "topic_status" || k === "topic_type" || k === "title")) continue; // optional in a file: not stated, not cleared
    fieldChanges[k] = inc[k];
    if (SAID[k]) said.push(`${SAID[k]}: ${existing[k] || "—"} → ${inc[k] || "—"}`);
    if (inc[k] === undefined) delete t[k]; else t[k] = inc[k];
  }
  const changed = said.length > 0 || Object.keys(fieldChanges).length > 0;
  if (changed) t.history.push({ date: now, author: actor, action: `Imported from a BCF file${said.length ? ": " + said.join(", ") : ""}` });
  return { topic: t, created: false, changed, fieldChanges };
}
