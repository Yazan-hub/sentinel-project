// openCDE slice 3 — the draft-03 validator over the vendored BCF-API schemas, and Sentinel's shapes against them (offline).
import { describe, it, expect } from "vitest";
import { loadSchema, validate, validateList, ROUTES, reportTable, runConformance } from "./bcf-conformance.mjs";
import { bcfTopic, bcfComment, bcfViewpoint, fileEntries, extensionsFor, topicEvents, authDocument } from "./bcf-open.mjs";

describe("the validator (draft-03 subset)", () => {
  it("required, type lists, enum, items, minItems, $ref", () => {
    const topic = loadSchema("Collaboration/Topic/topic_GET.json");
    expect(validate({ guid: "g", server_assigned_id: "g", title: "t", creation_date: "d", creation_author: "a" }, topic)).toEqual([]);
    expect(validate({ guid: "g", title: "t" }, topic)).toEqual(expect.arrayContaining(["$.server_assigned_id: required, missing", "$.creation_date: required, missing"]));
    expect(validate({ guid: 1, server_assigned_id: "g", title: "t", creation_date: "d", creation_author: "a", labels: [1] }, topic)).toEqual(["$.guid: is integer, the schema wants string", "$.labels[0]: is integer, the schema wants string|null"]);
    expect(validate({ topic_guid: "g", date: "d", author: "a", actions: [] }, loadSchema("Collaboration/Events/topic_event_GET.json"))).toEqual(["$.actions: 0 item(s), at least 1 wanted"]);
    expect(validate({ snapshot_type: "gif" }, loadSchema("Collaboration/Viewpoint/snapshot_GET.json"))).toEqual(['$.snapshot_type: "gif" is not one of jpg, png']);
    expect(validate({ topic_actions: ["update", "fly"] }, loadSchema("Collaboration/Topic/topic_GET.json").properties.authorization)).toEqual(['$.topic_actions[1]: "fly" is not one of update, updateBimSnippet, updateRelatedTopics, updateDocumentReferences, updateFiles, createComment, createViewpoint, delete']);
    expect(validateList("x", topic)).toEqual(["$: is string, a list is wanted"]);
  });
  it("every schema of the surface loads (the $refs resolve)", () => {
    for (const r of ROUTES) if (r.schema) expect(loadSchema(r.schema).type ?? loadSchema(r.schema).properties, r.schema).toBeTruthy();
  });
});

describe("Sentinel's shapes conform", () => {
  const topic = { guid: "G1", project_id: "p", title: "T", topic_type: "Issue", topic_status: "Open", priority: "Normal", assigned_to: "", due_date: null, stage: "", description: "", creation_author: "a", creation_date: "d", modified_date: "d", labels: [], comments: [{ guid: "C1", date: "d", author: "a", comment: "c", viewpoint_guid: null }], viewpoints: [{ guid: "V1", perspective_camera: null, components: { selection: [{ ifc_guid: "x" }] }, clipping_planes: [], snapshot: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}` }], history: [{ date: "d", author: "a", action: "Created" }] };
  it("a topic as the bridge stores it, with server_assigned_id added, is a topic_GET; a comment with its topic_guid a comment_GET", () => {
    expect(validate(topic, loadSchema("Collaboration/Topic/topic_GET.json"))).toEqual(["$.server_assigned_id: required, missing"]);   // the raw store
    expect(validate(bcfTopic(topic), loadSchema("Collaboration/Topic/topic_GET.json"))).toEqual([]);
    expect(validate(topic.comments[0], loadSchema("Collaboration/Comment/comment_GET.json"))).toEqual(["$.topic_guid: required, missing"]);
    expect(validate(bcfComment(topic.comments[0], topic), loadSchema("Collaboration/Comment/comment_GET.json"))).toEqual([]);
  });
  it("a viewpoint with its snapshot as {snapshot_type}, its selection, visibility and coloring; events, files, documents, extensions, user, project, error", () => {
    expect(validate(topic.viewpoints[0], loadSchema("Collaboration/Viewpoint/viewpoint_GET.json"))).toEqual(["$.snapshot: is string, the schema wants object|null"]);
    expect(validate(bcfViewpoint(topic.viewpoints[0]), loadSchema("Collaboration/Viewpoint/viewpoint_GET.json"))).toEqual([]);
    expect(validate({ selection: [{ ifc_guid: "x" }] }, loadSchema("Collaboration/Viewpoint/selection_GET.json"))).toEqual([]);
    expect(validate({ visibility: { default_visibility: true, exceptions: [], view_setup_hints: {} } }, loadSchema("Collaboration/Viewpoint/visibility_GET.json"))).toEqual([]);
    expect(validate({ coloring: [] }, loadSchema("Collaboration/Viewpoint/coloring_GET.json"))).toEqual([]);
    expect(validateList(topicEvents(topic), loadSchema("Collaboration/Events/topic_event_GET.json"))).toEqual([]);
    const files = fileEntries([{ id: "c1", iso_name: "A.ifc", container_versions: [{ id: "v1", created_at: "d", is_live: true, revision: "P01" }] }], "p");
    expect(validate(files, loadSchema("Collaboration/File/project_files_information_GET.json"))).toEqual([]);
    expect(files[0].display_information).toEqual([{ field_display_name: "File", field_value: "A.ifc" }, { field_display_name: "Revision", field_value: "P01" }]);
    expect(validate({ guid: "c1", filename: "A.ifc" }, loadSchema("Collaboration/Document/document_GET.json"))).toEqual([]);
    expect(validate(extensionsFor([{ email: "a@example.test" }]), loadSchema("Project/extensions_GET.json"))).toEqual([]);
    expect(validate({ id: "u", name: "u" }, loadSchema("User/user_GET.json"))).toEqual([]);
    expect(validate({ project_id: "p", name: "P", authorization: { project_actions: ["createTopic"] } }, loadSchema("Project/project_GET.json"))).toEqual([]);
    expect(validate({ message: "topic not found" }, loadSchema("error.json"))).toEqual([]);
    expect(authDocument("https://b.example.test").supported_oauth2_flows).toEqual(["authorization_code_grant"]);
  });
  it("the runner walks the surface on a fake bridge and reports one row per route", async () => {
    const answers = { "/bcf/versions": {}, "/bcf/3.0/auth": {}, "/bcf/3.0/current-user": { id: "u" }, "/bcf/3.0/projects": [{ project_id: "p", name: "P" }], "/bcf/3.0/projects/p": { project_id: "p", name: "P" },
      "/bcf/3.0/projects/p/extensions": extensionsFor([]), "/bcf/3.0/projects/p/files": [], "/bcf/3.0/projects/p/documents": [], "/bcf/3.0/projects/p/topics?status=all&$top=5": [bcfTopic(topic)], "/bcf/3.0/projects/p/topics/events?$top=5": topicEvents(topic),
      "/bcf/3.0/projects/p/topics/G1": bcfTopic(topic), "/bcf/3.0/projects/p/topics/G1/events": topicEvents(topic), "/bcf/3.0/projects/p/topics/G1/comments": [bcfComment(topic.comments[0], topic)], "/bcf/3.0/projects/p/topics/G1/viewpoints": [bcfViewpoint(topic.viewpoints[0])],
      "/bcf/3.0/projects/p/topics/G1/related_topics": [], "/bcf/3.0/projects/p/topics/G1/document_references": [], "/bcf/3.0/projects/p/topics/G1/viewpoints/V1/selection": { selection: [] }, "/bcf/3.0/projects/p/topics/G1/viewpoints/V1/coloring": { coloring: [] }, "/bcf/3.0/projects/p/topics/G1/viewpoints/V1/visibility": { visibility: { default_visibility: true } } };
    const fetchImpl = async (u) => { const p = u.replace("http://b", ""); const body = answers[p]; return { status: body === undefined ? 404 : 200, text: async () => JSON.stringify(body ?? { message: "not found" }) }; };
    const rows = await runConformance({ base: "http://b", bearer: "x", pid: "p", fetchImpl });
    expect(rows).toHaveLength(ROUTES.length);
    expect(rows.filter((r) => r.ok === false)).toEqual([]);
    expect(reportTable(rows)).toContain("| error (unknown topic) | 404 | ✅ conforms |");
  });
});
