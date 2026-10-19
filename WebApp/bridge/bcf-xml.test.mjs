// BCF round trip without loss, on the buildingSMART BCF-XML test cases (fixtures/bcf-xml, unmodified, CC BY-ND 4.0).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { readBcfZip, writeBcfZip, diffBcfZip } from "./bcf-xml.mjs";
import { zipSync, unzipSync } from "fflate";

const DIR = new URL("./fixtures/bcf-xml/", import.meta.url);
const cases = readdirSync(DIR).filter((f) => f.endsWith(".bcf"));
const load = (f) => new Uint8Array(readFileSync(new URL(encodeURIComponent(f), DIR)));
const guids = (topics) => topics.flatMap((t) => [t.guid, ...t.comments.map((c) => c.guid), ...t.viewpoints.map((v) => v.guid),
  ...t.viewpoints.flatMap((v) => [...(v.components?.selection || []), ...(v.components?.visibility?.exceptions || []), ...(v.components?.coloring || []).flatMap((c) => c.components)].map((c) => c.ifc_guid))]).sort();

describe("BCF-XML round trip — buildingSMART test cases", () => {
  it("has the samples", () => expect(cases.length).toBeGreaterThan(30));

  for (const f of cases) {
    const version = f.startsWith("v3.0") ? "3.0" : "2.1";
    it(`${f}: same version, nothing lost at XML level`, () => {
      const src = load(f);
      const pkg = readBcfZip(src);
      const { bytes, lost } = writeBcfZip(pkg.topics, { version, project: pkg.project, extra_files: pkg.extra_files, detailed_version: pkg.detailed_version });
      expect(lost).toEqual([]);
      expect(diffBcfZip(src, bytes)).toEqual([]);
      expect(readBcfZip(bytes)).toEqual(pkg); // model level
    });
    it(`${f}: other version and back keeps GUIDs, comments, viewpoints and snapshots`, () => {
      const pkg = readBcfZip(load(f));
      const other = version === "3.0" ? "2.1" : "3.0";
      const there = readBcfZip(writeBcfZip(pkg.topics, { version: other }).bytes);
      const back = readBcfZip(writeBcfZip(there.topics, { version }).bytes);
      expect(guids(back.topics)).toEqual(guids(pkg.topics));
      for (const [i, t] of pkg.topics.entries()) {
        const b = back.topics[i];
        for (const k of ["title", "topic_status", "topic_type", "priority", "labels", "assigned_to", "creation_date", "creation_author", "modified_date", "due_date", "description", "stage", "related_topics", "reference_links"])
          // 3.0 requires a type and a status: a 2.1 topic without them gains Sentinel's defaults on the way through 3.0.
          expect(b[k], `${t.guid} ${k}`).toEqual(k === "topic_status" ? t[k] ?? "Open" : k === "topic_type" ? t[k] ?? "Issue" : t[k]);
        expect(b.comments.map(({ x_xml, ...c }) => c)).toEqual(t.comments.map(({ x_xml, ...c }) => c));
        for (const [j, v] of t.viewpoints.entries()) {
          expect(b.viewpoints[j].snapshot).toEqual(v.snapshot);
          expect(b.viewpoints[j].components).toEqual(v.components);
          expect(b.viewpoints[j].clipping_planes).toEqual(v.clipping_planes);
          expect(b.viewpoints[j].lines).toEqual(v.lines);
        }
      }
    });
  }

  it("a topic Sentinel made (empty assignee, no due date, a data-URL snapshot, its own history) exports clean and reads back", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const t = { guid: "0b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f", project_id: "demo", model: "", title: "Door clash", topic_type: "Issue", topic_status: "Open", priority: "Normal",
      assigned_to: "", due_date: null, stage: "", description: "", creation_author: "a@x.test", creation_date: "2026-10-19T10:00:00.000Z", modified_date: "2026-10-19T10:00:00.000Z",
      labels: [], history: [{ date: "x", author: "a", action: "Created" }], comments: [{ guid: "1b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f", date: "2026-10-19T10:01:00.000Z", author: "a@x.test", comment: "see view", viewpoint_guid: "2b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f" }],
      viewpoints: [{ guid: "2b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f", perspective_camera: { camera_view_point: { x: 1, y: 2, z: 3 }, camera_direction: { x: 0, y: 1, z: 0 }, camera_up_vector: { x: 0, y: 0, z: 1 }, field_of_view: 60 },
        components: { selection: [{ ifc_guid: "2O2Fr$t4X7Zf8NOew3FLOH" }] }, snapshot: { snapshot_type: "png", snapshot_data: `data:image/png;base64,${png}` } }] };
    for (const version of ["2.1", "3.0"]) {
      const back = readBcfZip(writeBcfZip([t], { version }).bytes).topics[0];
      expect(back).toMatchObject({ guid: t.guid, title: "Door clash", topic_status: "Open", comments: [{ comment: "see view", viewpoint_guid: t.viewpoints[0].guid }] });
      expect([back.assigned_to, back.due_date, back.history, back.project_id]).toEqual([undefined, undefined, undefined, undefined]);
      expect(back.viewpoints[0].snapshot).toBe(`data:image/png;base64,${png}`); // the store's shape, both ways
      expect(back.viewpoints[0].components.selection).toEqual([{ ifc_guid: "2O2Fr$t4X7Zf8NOew3FLOH" }]);
    }
  });

  it("what each version's schema requires is written: 2.1 Visibility and ExtensionSchema; 3.0 AspectRatio, one camera, type/status, a title, wrapped coloring", () => {
    const g = (n) => `${n}b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f`;
    const cam = { camera_view_point: { x: 0, y: 0, z: 0 }, camera_direction: { x: 1, y: 0, z: 0 }, camera_up_vector: { x: 0, y: 0, z: 1 } };
    const t = { guid: g(0), title: " ", comments: [{ guid: g(1), date: "2026-10-19T10:00:00Z", author: "a", comment: "" }], viewpoints: [
      { guid: g(2), perspective_camera: { ...cam, field_of_view: 60 }, components: { selection: [{ ifc_guid: "2O2Fr$t4X7Zf8NOew3FLOH" }], coloring: [{ color: "FF0000", components: [{ ifc_guid: "1O2Fr$t4X7Zf8NOew3FLOH" }] }] } },
      { guid: g(3), perspective_camera: { ...cam, field_of_view: 60 }, orthogonal_camera: { ...cam, view_to_world_scale: 1 } },
      { guid: g(4), components: { selection: [{ ifc_guid: "3O2Fr$t4X7Zf8NOew3FLOH" }] }, snapshot: "data:image/png;base64,AQ==" }] };
    const files = (v) => { const { bytes, lost } = writeBcfZip([t], { version: v, project: { project_id: "p", name: "P" } }); return { z: unzipSync(bytes), lost, back: readBcfZip(bytes).topics[0] }; };
    const text = (z, p) => new TextDecoder().decode(z[p]);
    const a = files("2.1");
    expect(text(a.z, `${g(0)}/Viewpoint_${g(2)}.bcfv`)).toMatch(/<Visibility DefaultVisibility="true"\/>/);
    expect(text(a.z, "project.bcfp")).toMatch(/<ExtensionSchema\/>/);
    const b = files("3.0");
    const vis = text(b.z, `${g(0)}/Viewpoint_${g(2)}.bcfv`);
    expect(vis).toMatch(/<AspectRatio>1\.7777/);
    expect(vis).toMatch(/<Color Color="FF0000">\s*<Components>\s*<Component IfcGuid="1O2Fr\$t4X7Zf8NOew3FLOH"/);
    expect(text(b.z, `${g(0)}/Viewpoint_${g(3)}.bcfv`)).not.toMatch(/OrthogonalCamera/);
    expect(Object.keys(b.z).some((p) => p.includes(`Viewpoint_${g(4)}`))).toBe(false); // no camera: no 3.0 viewpoint file
    expect(b.z[`${g(0)}/Snapshot_${g(4)}.png`]).toBeDefined(); // its snapshot stays
    expect(b.lost.join("\n")).toMatch(/orthogonal camera/);
    expect(b.lost.join("\n")).toMatch(/needs a camera/);
    const markup = text(b.z, `${g(0)}/markup.bcf`);
    expect(markup).toMatch(/TopicType="Issue"/);
    expect(markup).toMatch(/TopicStatus="Open"/);
    expect(markup).toMatch(/<Title>Untitled<\/Title>/);
    expect(markup).not.toMatch(/<Comment\/>/);
    expect(b.back.viewpoints[0].components.coloring).toEqual(t.viewpoints[0].components.coloring); // read back through the 3.0 wrapper
  });

  it("a BCF 2.0 file is refused in words, not half read", () => {
    const z = zipSync({ "bcf.version": new TextEncoder().encode('<Version VersionId="2.0"><DetailedVersion>2.0</DetailedVersion></Version>') });
    expect(() => readBcfZip(z)).toThrow(/BCF 2\.0 file, which Sentinel does not read/);
  });

  it("merge: a newer file without the optional status or type keeps Sentinel's; related topics are GUIDs", async () => {
    const { mergeImported } = await import("./bcf-xml.mjs");
    const old = { guid: "g", title: "T", topic_status: "In Progress", topic_type: "Clash", modified_date: "2026-10-01T00:00:00Z", comments: [], viewpoints: [], history: [] };
    const r = mergeImported(old, { guid: "g", modified_date: "2026-10-18T00:00:00Z", priority: "High", comments: [], viewpoints: [] }, { pid: "p" });
    expect([r.topic.topic_status, r.topic.topic_type, r.topic.title, r.topic.priority]).toEqual(["In Progress", "Clash", "T", "High"]);
    const rel = readBcfZip(load(cases.find((f) => /related topics with both/i.test(f) && f.startsWith("v2.1")))).topics.find((t) => t.related_topics);
    expect(rel.related_topics.every((x) => typeof x === "string")).toBe(true);
  });

  it("a zip bomb is refused before it is unpacked (413), and a package path that leaves the package is refused (400)", () => {
    // 3 entries that each unpack to 1 MB of zeros, against a 2 MB cap (the bridge's is 256 MB): what the entries claim is refused before it is unpacked.
    const zeros = new Uint8Array(1024 * 1024);
    const bomb = zipSync(Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`t${i}/markup.bcf`, zeros])), { level: 9 });
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    expect(() => readBcfZip(bomb, { maxBytes: 2 * 1024 * 1024 })).toThrow(expect.objectContaining({ status: 413 }));
    for (const p of ["../evil.bat", "a/../../evil.bat", "/abs.bcf", "C:/x.bcf", "a\\..\\..\\x"]) {
      const z = zipSync({ "bcf.version": new TextEncoder().encode('<Version VersionId="2.1"/>'), [p]: new Uint8Array([1]) });
      expect(() => readBcfZip(z), p).toThrow(expect.objectContaining({ status: 400, message: expect.stringMatching(/leaves the package/) }));
    }
  });

  it("a stored reference that leaves the package is not written on export, and the export says so", () => {
    const t = { guid: "0b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f", title: "x", topic_status: "Open", creation_date: "2026-10-19T10:00:00Z", creation_author: "a",
      comments: [], viewpoints: [{ guid: "2b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f", x_file: "../../evil.bcfv", snapshot: { snapshot_type: "png", snapshot_data: "AQ==", x_file: "../../evil.bat" } }],
      document_references: [{ guid: "3b6b3c3e-1f2a-4c5d-8e9f-0a1b2c3d4e5f", x_document: { filename: "../../x.bat", data: "AQ==" } }] };
    for (const version of ["2.1", "3.0"]) {
      const { bytes, lost } = writeBcfZip([t], { version });
      expect(Object.keys(unzipSync(bytes)).filter((p) => p.includes(".."))).toEqual([]);
      expect(lost.some((l) => /leaves the package/.test(l))).toBe(true);
    }
  });

  it("a file that is not BCF is a 400 in words", () => {
    expect(() => readBcfZip(new TextEncoder().encode("hello"))).toThrow(/not a BCF package/);
  });
});
