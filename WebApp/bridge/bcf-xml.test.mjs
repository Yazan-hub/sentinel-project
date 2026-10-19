// BCF round trip without loss, on the buildingSMART BCF-XML test cases (fixtures/bcf-xml, unmodified, CC BY-ND 4.0).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { readBcfZip, writeBcfZip, diffBcfZip } from "./bcf-xml.mjs";

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
          expect(b[k], `${t.guid} ${k}`).toEqual(t[k]);
        expect(b.comments.map(({ x_xml, ...c }) => c)).toEqual(t.comments.map(({ x_xml, ...c }) => c));
        for (const [j, v] of t.viewpoints.entries()) {
          expect(b.viewpoints[j].snapshot?.snapshot_data).toEqual(v.snapshot?.snapshot_data);
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
      expect(back.viewpoints[0].snapshot.snapshot_data).toBe(png);
      expect(back.viewpoints[0].components.selection).toEqual([{ ifc_guid: "2O2Fr$t4X7Zf8NOew3FLOH" }]);
    }
  });

  it("a file that is not BCF is a 400 in words", () => {
    expect(() => readBcfZip(new TextEncoder().encode("hello"))).toThrow(/not a BCF package/);
  });
});
