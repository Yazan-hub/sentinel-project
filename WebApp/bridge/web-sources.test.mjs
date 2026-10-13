// MA-7-2 — the counsel switch and the source lists: whole-label host matching (RED), host + path prefix (AMBER/GREEN), and the switch's modes.
import { describe, it, expect } from "vitest";
import { SOURCES, SOURCES_SHA256, RED_LABELS, RED_HOSTS, classifyHost, webSwitch, webRefusal, OFF, ON_NO_REF, DRILL, DRILL_NO_KEY, NO_A } from "./web-sources.mjs";

const REF = "ab12".repeat(16);

describe("classifyHost", () => {
  it("RED by whole label or host, whatever the path", () => {
    for (const u of ["https://maps.google.co.uk/x", "https://lh3.ggpht.com/x", "https://t0.tiles.virtualearth.net/x", "https://maps.apple.com/x", "https://atlas.microsoft.com/x", "https://GOO.gl/x"])
      expect(classifyHost(u)?.list, u).toBe("RED");
  });
  it("never a substring: bingham is not RED, nor is it anything", () => {
    expect(classifyHost("https://bingham.example.test/x")).toBeNull();
    expect(classifyHost("https://notgoogle.example.test/x")).toBeNull();
  });
  it("Commons is AMBER; only https; upload.wikimedia.org only under /wikipedia/commons/", () => {
    expect(classifyHost("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toEqual({ list: "AMBER", id: "wikimedia-commons" });
    expect(classifyHost("https://commons.wikimedia.org/wiki/File:X.jpg")).toEqual({ list: "AMBER", id: "wikimedia-commons" });
    expect(classifyHost("https://upload.wikimedia.org/wikipedia/en/a/ab/x.jpg")).toBeNull();
    expect(classifyHost("http://commons.wikimedia.org/x")).toBeNull();
    expect(classifyHost("http://maps.google.com/x")).toEqual({ list: "RED", id: "google" }); // MA-7-2 review: http RED reads RED
    expect(classifyHost("https://upload.wikimedia.org/wikipedia/commons/..%2fen/a/ab/x.jpg")).toBeNull(); // encoded slash hides /wikipedia/en/
    expect(classifyHost("https://github.com/microsoft/GlobalMLBuildingFootprints%2f..%2fx")).toBeNull();
    expect(classifyHost("https://github.com/Microsoft/globalmlbuildingfootprints/x")).toEqual({ list: "GREEN", id: "ms-footprints" });
    for (const u of ["https://s3.amazonaws.com/b/x", "https://blob.core.windows.net/b/x", "https://fbcdn.net/x"]) expect(classifyHost(u), u).toBeNull(); // no shared cloud apex is listed
    expect(classifyHost("not a url")).toBeNull();
  });
  it("github.com is classified only under the Microsoft footprints path", () => {
    expect(classifyHost("https://github.com/someone/repo")).toBeNull();
    expect(classifyHost("https://github.com/microsoft/GlobalMLBuildingFootprints/x")).toEqual({ list: "GREEN", id: "ms-footprints" });
    expect(classifyHost("https://github.com/microsoft/GlobalMLBuildingFootprintsEvil/x")).toBeNull();
  });
  it("a sub-domain of a listed host matches; a look-alike does not", () => {
    expect(classifyHost("https://www.openstreetmap.org/x")?.id).toBe("osm");
    expect(classifyHost("https://evilopenstreetmap.org/x")).toBeNull();
  });
});

describe("webSwitch", () => {
  it("unset or anything else is off with the OFF words", () => {
    expect(webSwitch({})).toEqual({ mode: "off", why: OFF, counsel_ref12: null });
    expect(webSwitch({ SENTINEL_WEB_EVIDENCE: "yes" }).why).toBe(OFF);
  });
  it("on needs a 64-hex counsel ref", () => {
    expect(webSwitch({ SENTINEL_WEB_EVIDENCE: "on" })).toMatchObject({ mode: "off", why: ON_NO_REF });
    expect(webSwitch({ SENTINEL_WEB_EVIDENCE: "on", SENTINEL_WEB_COUNSEL_REF: "abc" }).mode).toBe("off");
    const on = webSwitch({ SENTINEL_WEB_EVIDENCE: " ON ", SENTINEL_WEB_COUNSEL_REF: REF });
    expect(on.mode).toBe("on"); expect(on.counsel_ref12).toHaveLength(12);
  });
  it("drill names its projects (amendment 8): only those read drill; bare drill reads off with words", () => {
    const env = { SENTINEL_WEB_EVIDENCE: "drill:ma7-web-drill" };
    expect(webSwitch(env, "ma7-web-drill")).toMatchObject({ mode: "drill", why: DRILL });
    expect(webSwitch(env, "ma4c-drill").mode).toBe("off");
    expect(webSwitch(env).mode).toBe("off");
    expect(webSwitch({ SENTINEL_WEB_EVIDENCE: "drill:a, b" }, "b").mode).toBe("drill");
    expect(webSwitch({ SENTINEL_WEB_EVIDENCE: "drill" }, "ma7-web-drill")).toMatchObject({ mode: "off", why: DRILL_NO_KEY });
  });
});

describe("webRefusal", () => {
  const signedA = { attestations: [{ code: "a" }] };
  it("403 while off, 409 without (a), else null", () => {
    expect(webRefusal(signedA, {}, "k")).toEqual({ status: 403, words: OFF });
    const env = { SENTINEL_WEB_EVIDENCE: "drill:k" };
    expect(webRefusal({ attestations: [] }, env, "k")).toEqual({ status: 409, words: NO_A });
    expect(webRefusal(signedA, env, "k")).toBeNull();
  });
});

describe("the table", () => {
  it("ids are unique, every GREEN/AMBER row is held for counsel, and share-alike rows are held", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOURCES) { expect(s.held_for_counsel, s.id).toBe(true); expect(["GREEN", "AMBER"]).toContain(s.list); }
    for (const s of SOURCES.filter((x) => x.share_alike)) expect(s.held_for_counsel, s.id).toBe(true);
    expect(SOURCES.filter((s) => s.share_alike).map((s) => s.id).sort()).toEqual(["kartaview", "mapillary", "ms-footprints", "osm", "overture", "panoramax"]);
  });
  it("no listed host is RED, and the hash is 64 hex", () => {
    for (const s of SOURCES) for (const h of s.hosts) expect(h.split(".").some((l) => RED_LABELS.includes(l)), h).toBe(false);
    expect(SOURCES_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("the approved lists are pinned: a change here is the founder's approval (D5)", () => {
    expect(SOURCES_SHA256).toBe("cb21cd4956880d0b6db0067abb9f2cc5a62b601d318a8c5a18babdf0cadcc9f1");
  });
  it("the table is frozen all the way down", () => {
    expect(() => SOURCES[0].hosts.push("evil.example.test")).toThrow();
    expect(() => SOURCES.push({})).toThrow();
    expect(() => RED_LABELS.push("x")).toThrow();
    expect(() => RED_HOSTS.push("x")).toThrow();
    expect(() => { SOURCES[0].licences[0] = "MIT"; }).toThrow();
    expect(classifyHost("https://evil.example.test/")).toBeNull();
  });
});
