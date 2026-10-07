// SEC-5: Open 3D checks the bytes it downloads against the bridge's "geometry linked" row before it loads them.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { firstTag, geometryCheck, linkedHash, linkedTag, sha256Hex } from "./geometry-check";

const F = "f".repeat(64), I = "a".repeat(64), OTHER = "0".repeat(64);
const row = (nv: Record<string, string>) => ({ new_value: { platform_item_id: "item-1", ...nv } });
const CHANGED = "the downloaded bytes are not the ones linked to this version (the item changed on the platform, or the download was cut) — not shown";
const LEGACY = "geometry not hash-checked — this version was linked before Sentinel recorded the geometry's hash";
const NO_ROW = "geometry not hash-checked — the ledger holds no geometry link for this version";
const FIRST = "geometry not hash-checked — the item's first platform version";

describe("sha256Hex", () => {
  it("is the lower-case hex sha256 of the bytes", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("geometryCheck — never other bytes as the version's geometry", () => {
  it("bytes that hash to the link's .frag (or, on a raw-IFC link recorded since SEC-5, its IFC) load, checked", () => {
    expect(geometryCheck(F, "item-1", row({ frag_sha256: F, ifc_sha256: I }))).toEqual({ load: true, checked: true, line: "geometry checked against the ledger's link" });
    expect(geometryCheck(F.toUpperCase(), "item-1", row({ frag_sha256: F }))).toMatchObject({ load: true, checked: true });
    expect(geometryCheck(I, "item-1", row({ ifc_sha256: I, ifc_item_id: "item-1" }))).toMatchObject({ load: true, checked: true });
  });
  it("other bytes under a link that records a hash are refused in words — a .frag link, and a raw-IFC link since SEC-5 (review C1)", () => {
    expect(geometryCheck(OTHER, "item-1", row({ frag_sha256: F, ifc_sha256: I }))).toEqual({ load: false, line: CHANGED });
    expect(geometryCheck(I, "item-1", row({ frag_sha256: F, ifc_sha256: I, ifc_item_id: "item-2" }))).toEqual({ load: false, line: CHANGED });
    expect(geometryCheck(OTHER, "item-1", row({ ifc_sha256: I, ifc_item_id: "item-1" }))).toEqual({ load: false, line: CHANGED });
    expect(geometryCheck(OTHER, "item-1", row({ ifc_item_id: "item-1" }))).toEqual({ load: false, line: CHANGED });
  });
  it("a link to another item is refused", () => {
    expect(geometryCheck(F, "item-2", row({ frag_sha256: F }))).toEqual({ load: false, line: "the ledger links another platform item to this version — not shown as this version's geometry" });
  });
  it("a link that recorded no hash, or no link row at all, loads with words that say it was not checked (A-a, review C2, C6)", () => {
    expect(linkedHash(row({ ifc_sha256: I }))).toBeNull();
    expect(linkedHash(null)).toBeNull();
    expect(geometryCheck(OTHER, "item-1", row({ ifc_sha256: I }))).toEqual({ load: true, checked: false, line: LEGACY });
    expect(geometryCheck(OTHER, "item-1", { new_value: null })).toEqual({ load: true, checked: false, line: LEGACY });
    expect(geometryCheck(OTHER, "item-1", null)).toEqual({ load: true, checked: false, line: NO_ROW });
    expect(geometryCheck(OTHER, "item-1", row({ ifc_sha256: I }), "v1")).toEqual({ load: true, checked: false, line: FIRST });
    expect(geometryCheck(OTHER, "item-1", null, "v1")).toEqual({ load: true, checked: false, line: FIRST });
  });
  it("firstTag: the oldest tag of an item with more than one version, else null", () => {
    expect(firstTag(undefined)).toBeNull();
    expect(firstTag([{ tag: "v1" }])).toBeNull();
    expect(firstTag([{ tag: "v3" }, { tag: "v2" }, { tag: "v1" }])).toBe("v1");
    expect(firstTag([{ tag: "b", createdAt: "2026-10-02" }, { tag: "a", createdAt: "2026-10-01" }, { tag: "c", createdAt: "2026-10-03" }])).toBe("a");
  });
  it("SEC-7: linkedTag is the platform version tag the link recorded, else null", () => {
    expect(linkedTag(row({ frag_sha256: F, version_tag: "P01" }))).toBe("P01");
    expect(linkedTag(row({ frag_sha256: F }))).toBeNull();
    expect(linkedTag({ new_value: null })).toBeNull();
    expect(linkedTag(null)).toBeNull();
  });
  it("the Files window reads the link row first, lists the versions only for an unchecked link, downloads the linked tag (else the first, else the newest), then checks the bytes before it loads them", () => {
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8").replace(/\r/g, "");
    const read = src.indexOf("/audit?entity_type=file_version&entity_id=${v.id}&action_prefix=geometry%20linked&limit=1");
    const list = src.indexOf("if (linkedHash(link) === null && client.listVersions) first = firstTag(await client.listVersions(v.platform_item_id).catch(() => null));");
    const tag = src.indexOf("const tag = linkedTag(link) ?? first;");
    const dl = src.indexOf("await client.downloadFile(v.platform_item_id, tag ? { versionTag: tag } : undefined)");
    const check = src.indexOf("const check = geometryCheck(await sha256Hex(buf), v.platform_item_id, link, first);");
    const refuse = src.indexOf("if (!check.load) { status(`${f.iso_name} ${v.revision}: ${check.line}.`); return; }");
    const load = src.indexOf("await core.load(buf, { modelId });");
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThan(list);
    expect(list).toBeLessThan(tag);
    expect(tag).toBeLessThan(dl);
    expect(dl).toBeLessThan(check);
    expect(check).toBeLessThan(refuse);
    expect(refuse).toBeLessThan(load);
    expect(src).toContain("the ledger's geometry link could not be read");
    // SEC-7 (founder decision B-a): a recorded tag the platform does not serve is said — never the item's newest version instead.
    expect(src).toContain('the platform did not serve version tag "${tag}" of this item (HTTP ${resp.status})');
  });
});
