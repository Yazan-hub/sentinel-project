// openCDE slice 1 — the pure parts of the BCF-API 3.0 reads.
import { describe, it, expect } from "vitest";
import { parseOpen, page, snapshotBytes, fileEntries, extensionsFor, BCF_VERSIONS, EXTENSIONS, authDocument, publicBase, redirectAllowed, codeStore, authorizePage, topicEvents, methodAllowed, isPublicOpenRoute } from "./bcf-open.mjs";

describe("parseOpen", () => {
  it("knows every open read and leaves the topic block its routes", () => {
    expect(parseOpen("/bcf/versions")).toEqual({ kind: "versions" });
    expect(parseOpen("/bcf/3.0/current-user")).toEqual({ kind: "current-user" });
    expect(parseOpen("/bcf/3.0/projects")).toEqual({ kind: "projects" });
    expect(parseOpen("/bcf/3.0/projects/p1")).toEqual({ kind: "project", pid: "p1" });
    expect(parseOpen("/bcf/3.0/projects/p1/extensions")).toEqual({ kind: "extensions", pid: "p1" });
    expect(parseOpen("/bcf/3.0/projects/p1/files")).toEqual({ kind: "files", pid: "p1" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g")).toEqual({ kind: "topic", pid: "p1", guid: "g" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g", "PUT")).toBeNull();           // the block's edit
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g", "DELETE")).toEqual({ kind: "topic", pid: "p1", guid: "g" }); // slice 2: the governed close
    expect(parseOpen("/bcf/3.0/auth")).toEqual({ kind: "auth" }); expect(parseOpen("/oauth/token")).toEqual({ kind: "token" });
    expect(parseOpen("/bcf/3.0/projects/p1/documents/d1")).toEqual({ kind: "document", pid: "p1", sub: "d1" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/events")).toEqual({ kind: "events", pid: "p1" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g/related_topics")).toEqual({ kind: "topic_related_topics", pid: "p1", guid: "g" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g/document_references")).toEqual({ kind: "topic_document_references", pid: "p1", guid: "g" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics")).toBeNull();                    // the block's list (paged there)
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g/comments")).toEqual({ kind: "comments", pid: "p1", guid: "g" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g/comments", "POST")).toBeNull(); // the block's add
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g/comments/c1")).toEqual({ kind: "comment", pid: "p1", guid: "g", sub: "c1" });
    expect(parseOpen("/bcf/3.0/projects/p1/topics/g/viewpoints/v1")).toEqual({ kind: "viewpoint", pid: "p1", guid: "g", sub: "v1" });
    for (const k of ["snapshot", "selection", "coloring", "visibility"]) expect(parseOpen(`/bcf/3.0/projects/p1/topics/g/viewpoints/v1/${k}`)).toEqual({ kind: k, pid: "p1", guid: "g", sub: "v1" });
    expect(parseOpen("/bcf/3.0/projects/p1/nothing")).toBeNull();
  });
});

describe("slice 2: auth document, redirects, codes, the consent page, events, methods", () => {
  it("the auth document points at this bridge as the caller reached it (the Funnel's forwarded host)", () => {
    expect(publicBase({ host: "127.0.0.1:4100" })).toBe("http://127.0.0.1:4100");
    expect(publicBase({ host: "127.0.0.1:4100", "x-forwarded-proto": "https", "x-forwarded-host": "bridge.example.test" })).toBe("https://bridge.example.test");
    expect(authDocument("https://bridge.example.test")).toEqual({ oauth2_auth_url: "https://bridge.example.test/oauth/authorize", oauth2_token_url: "https://bridge.example.test/oauth/token", http_basic_supported: false, supported_oauth2_flows: ["authorization_code_grant"] });
    expect(isPublicOpenRoute("GET", "/bcf/3.0/auth")).toBe(true); expect(isPublicOpenRoute("POST", "/oauth/token")).toBe(true);
    expect(isPublicOpenRoute("POST", "/oauth/code")).toBe(false); expect(isPublicOpenRoute("GET", "/bcf/3.0/projects")).toBe(false);
  });
  it("a redirect is https, or http on the client's own machine", () => {
    expect(redirectAllowed("https://app.example.test/cb")).toBe(true); expect(redirectAllowed("http://localhost:8080/cb")).toBe(true); expect(redirectAllowed("http://127.0.0.1/cb")).toBe(true);
    expect(redirectAllowed("http://evil.example.test/cb")).toBe(false); expect(redirectAllowed("javascript:alert(1)")).toBe(false); expect(redirectAllowed("")).toBe(false);
  });
  it("a code is single use, 60 s, and bound to its client and redirect", () => {
    let t = 1000; const cs = codeStore(() => t);
    const code = cs.mint("c1", "http://localhost/cb", { access_token: "jwt", refresh_token: "r", expires_in: 3600 });
    expect(cs.take(code, "c2", "http://localhost/cb").error).toBe("invalid_grant");         // another client — and the code is spent
    expect(cs.take(code, "c1", "http://localhost/cb").error).toBe("invalid_grant");
    const c2 = cs.mint("c1", "http://localhost/cb", { access_token: "jwt" }); t += 61_000;
    expect(cs.take(c2, "c1", "http://localhost/cb").error_description).toMatch(/older than 60 seconds/);
    const c3 = cs.mint("c1", "http://localhost/cb", { access_token: "jwt2" });
    expect(cs.take(c3, "c1", "http://localhost/cb").session.access_token).toBe("jwt2"); expect(cs.size()).toBe(0);
  });
  it("the consent page signs in against Supabase in the browser, escapes the client's name, and posts to /oauth/code", () => {
    const html = authorizePage({ supabaseUrl: "https://x.supabase.co", anonKey: "anon", client_id: "<b>Zoom</b>", redirect_uri: "http://localhost/cb", state: "s1" });
    expect(html).toContain("&lt;b&gt;Zoom&lt;/b&gt;"); expect(html).not.toContain("<b>Zoom</b>");
    expect(html).toContain("/auth/v1/token?grant_type=password"); expect(html).toContain('fetch("/oauth/code"'); expect(html).toContain("never sends it to the bridge");
  });
  it("events come from the history; the methods table says what each route takes", () => {
    expect(topicEvents({ guid: "g", history: [{ date: "d", author: "a", action: "Created" }] })).toEqual([{ topic_guid: "g", date: "d", author: "a", events: [{ type: "history", value: "Created" }] }]);
    expect(methodAllowed("topic", "DELETE")).toBe(true); expect(methodAllowed("comment", "PUT")).toBe(true); expect(methodAllowed("snapshot", "DELETE")).toBe(false); expect(methodAllowed("nope", "GET")).toBe(false);
  });
});

describe("page", () => {
  const items = [{ topic_status: "Open", n: 1 }, { topic_status: "Closed", n: 2 }, { topic_status: "Open", n: 3 }, { topic_status: "Open", n: 4 }];
  const q = (s) => new URLSearchParams(s);
  it("filters by `field eq 'value'` terms, then skips, then tops", () => {
    expect(page(items, q("$filter=topic_status eq 'Open'")).map((i) => i.n)).toEqual([1, 3, 4]);
    expect(page(items, q("$filter=topic_status eq 'Open' and n eq '4'")).map((i) => i.n)).toEqual([4]);
    expect(page(items, q("$skip=1&$top=2")).map((i) => i.n)).toEqual([2, 3]);
    expect(page(items, q("")).length).toBe(4);
  });
  it("an unknown filter shape or a bad number is a 400 in words", () => {
    expect(() => page(items, q("$filter=n gt 2"))).toThrow(/only `field eq 'value'`/);
    expect(() => page(items, q("$top=-1"))).toThrow(/\$top must be a whole number/);
    expect(() => page(items, q("$skip=x"))).toThrow(/\$skip/);
  });
});

describe("snapshotBytes / fileEntries / extensionsFor", () => {
  it("a data URL gives its mime and bytes; bare base64 is a PNG; junk and nothing are null", () => {
    const png = Buffer.from([137, 80, 78, 71]).toString("base64");
    expect(snapshotBytes(`data:image/jpeg;base64,${png}`)).toMatchObject({ mime: "image/jpeg" });
    expect([...snapshotBytes(png).bytes]).toEqual([137, 80, 78, 71]);
    expect(snapshotBytes("not base64 !!")).toBeNull(); expect(snapshotBytes(null)).toBeNull(); expect(snapshotBytes("")).toBeNull();
  });
  it("files: the live version, else the newest; deleted versions and empty containers skipped; the reference is the version's route", () => {
    const cs = [
      { id: "c1", iso_name: "PRJ-A.ifc", container_versions: [{ id: "v1", created_at: "2026-01-01", is_live: false }, { id: "v2", created_at: "2026-02-01", is_live: true }, { id: "v3", created_at: "2026-03-01", deleted_at: "x" }] },
      { id: "c2", title: "untitled", container_versions: [{ id: "v9", created_at: "2026-01-05" }, { id: "v8", created_at: "2026-01-01" }] },
      { id: "c3", iso_name: "empty", container_versions: [] },
    ];
    const f = fileEntries(cs, "demo");
    expect(f.map((x) => [x.file_name, x.reference])).toEqual([["PRJ-A.ifc", "/cde/demo/containers/c1/versions/v2"], ["untitled", "/cde/demo/containers/c2/versions/v9"]]);
  });
  it("the extensions carry the members as users; versions name 3.0", () => {
    expect(extensionsFor([{ email: "a@example.test" }, { user_id: "u2" }]).users).toEqual(["a@example.test", "u2"]);
    expect(EXTENSIONS.topic_status).toContain("In Progress");
    expect(BCF_VERSIONS.versions[0].version_id).toBe("3.0");
  });
});
