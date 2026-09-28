// A version's ISO 19650 state on its platform copy (spec 2026-09-29 platform-native, Part B). stateLabels merges without
// dropping the platform's own keys and never regresses the label; mirrorState writes only onto a one-version non-IFC
// item and resolves on every failure; the hooks in transition() and reviewDecide() fire only after a committed RPC, are
// never awaited and never become the transition's error; with SENTINEL_PLATFORM_STATE unset nothing is mirrored.
// The platform client is a fake, globalThis.fetch is a fake PostgREST — no network, no database.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured" and forwarding armed. fetch is faked either way, so none of them is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});
// The mirror the hooks reach through their lazy import: a double, so a test can make it reject or hang. The real module
// is tested below through vi.importActual, always with an injected platform client.
vi.mock("./platform-state.mjs", () => ({ mirrorState: vi.fn(async () => ({ mirrored: false, reason: "test double" })) }));

import { mirrorState as hookMirror } from "./platform-state.mjs";
import { transition, reviewDecide } from "./cde-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

const { stateLabels, mirrorState } = await vi.importActual("./platform-state.mjs");

const P = "11111111-1111-4111-8111-111111111111";
const C = "cccccccc-0000-4000-8000-000000000001";
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const ITEM = "6ab9a0c113cf4cfc31e04e11";
const TOKEN = "tok_do_not_log_7f3a";
const FLAG = process.env.SENTINEL_PLATFORM_STATE;
afterEach(() => {
  if (FLAG === undefined) delete process.env.SENTINEL_PLATFORM_STATE; else process.env.SENTINEL_PLATFORM_STATE = FLAG;
});

describe("stateLabels — read, merge, write; never backwards", () => {
  it("keeps every other key as it is and writes the two labels as strings", () => {
    const existing = { sourceIfcId: "6ab9a0bf13cf4cfc31e04e0f", other: 3, flag: true };
    expect(stateLabels(existing, "shared", 812)).toEqual({ ...existing, sentinel_state: "shared", sentinel_state_row: "812" });
    expect(existing).toEqual({ sourceIfcId: "6ab9a0bf13cf4cfc31e04e0f", other: 3, flag: true }); // not mutated
  });

  it("an empty or missing map gets just the two labels", () => {
    for (const m of [{}, null, undefined, "x", []]) expect(stateLabels(m, "wip", 5)).toEqual({ sentinel_state: "wip", sentinel_state_row: "5" });
  });

  it("is null when the label already names our row or a newer one; an older or unreadable one is overwritten", () => {
    expect(stateLabels({ sentinel_state: "published", sentinel_state_row: "812" }, "shared", 812)).toBeNull();
    expect(stateLabels({ sentinel_state: "published", sentinel_state_row: "900" }, "shared", 812)).toBeNull();
    expect(stateLabels({ sentinel_state: "wip", sentinel_state_row: "811" }, "shared", 812)).toMatchObject({ sentinel_state: "shared", sentinel_state_row: "812" });
    for (const junk of ["", "abc", "8e2", null]) expect(stateLabels({ sentinel_state_row: junk }, "shared", 812)).toMatchObject({ sentinel_state_row: "812" });
  });
});

describe("mirrorState — the state onto the .frag's only version", () => {
  let version, stateRow, client, log, sb;
  const deps = () => ({ sb, platform: vi.fn(async () => client), log });
  beforeEach(() => {
    process.env.SENTINEL_PLATFORM_STATE = "on";
    version = { id: V, state: "shared", platform_item_id: ITEM };
    stateRow = { id: 812, new_value: { state: "shared", note: null } };
    sb = vi.fn(async (path) => (path.startsWith("container_versions") ? [version].filter(Boolean) : path.startsWith("audit_log") ? [stateRow].filter(Boolean) : []));
    client = {
      listVersions: vi.fn(async () => [{ itemId: ITEM, tag: "v1", createdAt: "2026-09-29T10:00:00Z" }]),
      getFile: vi.fn(async () => ({ _id: ITEM, name: "Tower.frag", fileExtension: "frag" })),
      getFileVersionMetadata: vi.fn(async () => ({ sourceIfcId: "6ab9a0bf13cf4cfc31e04e0f" })),
      updateFileVersionMetadata: vi.fn(async (_i, _t, m) => m),
    };
    log = vi.fn();
  });

  it("reads the version and its newest state: row with the service key, then merges and writes the labels", async () => {
    const d = deps();
    expect(await mirrorState(V, d)).toEqual({ mirrored: true, item: ITEM, tag: "v1", state: "shared", row: 812 });
    expect(sb.mock.calls).toEqual([
      [`container_versions?id=eq.${V}&select=id,state,platform_item_id`, { service: true }],
      [`audit_log?entity_type=eq.container_version&entity_id=eq.${V}&action=like.state:*&order=id.desc&limit=1&select=id,new_value`, { service: true }],
    ]);
    expect(client.getFileVersionMetadata).toHaveBeenCalledWith(ITEM, "v1");
    expect(client.updateFileVersionMetadata).toHaveBeenCalledWith(ITEM, "v1", { sourceIfcId: "6ab9a0bf13cf4cfc31e04e0f", sentinel_state: "shared", sentinel_state_row: "812" });
    expect(log).not.toHaveBeenCalled();
  });

  it("the label's state is the state: row's own, so state and row always belong together", async () => {
    version.state = "published"; // a later transition committed between the two reads; the row read is the older one
    await mirrorState(V, deps());
    expect(client.updateFileVersionMetadata.mock.calls[0][2]).toMatchObject({ sentinel_state: "shared", sentinel_state_row: "812" });
  });

  it("flag off: 'off', and neither the ledger nor the platform is touched", async () => {
    for (const v of [undefined, "", "1", "true", "ON"]) {
      if (v === undefined) delete process.env.SENTINEL_PLATFORM_STATE; else process.env.SENTINEL_PLATFORM_STATE = v;
      const d = deps();
      expect(await mirrorState(V, d)).toEqual({ mirrored: false, reason: "off" });
      expect(d.platform).not.toHaveBeenCalled();
    }
    expect(sb).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("a version with no platform copy, or unknown, or with no state: row: no platform call", async () => {
    version.platform_item_id = null;
    let d = deps();
    expect(await mirrorState(V, d)).toEqual({ mirrored: false, reason: "the version has no platform copy" });
    expect(d.platform).not.toHaveBeenCalled();
    expect(log).toHaveBeenLastCalledWith(`[platform-state] version ${V} item none: not mirrored — the version has no platform copy`);
    version = null;
    d = deps();
    expect(await mirrorState(V, d)).toEqual({ mirrored: false, reason: "the version was not found" });
    expect(d.platform).not.toHaveBeenCalled();
    version = { id: V, state: "wip", platform_item_id: ITEM };
    stateRow = null;
    d = deps();
    expect(await mirrorState(V, d)).toEqual({ mirrored: false, reason: "the version has no state: row on the ledger" });
    expect(d.platform).not.toHaveBeenCalled();
  });

  it("an .ifc item (the raw-IFC fallback) is never written — the gate's labels live there", async () => {
    client.getFile = vi.fn(async () => ({ _id: ITEM, name: "Tower.IFC", fileExtension: "ifc" }));
    const r = await mirrorState(V, deps());
    expect(r).toMatchObject({ mirrored: false });
    expect(r.reason).toMatch(/^Tower\.IFC is an IFC/);
    client.getFile = vi.fn(async () => ({ _id: ITEM, name: "Tower", fileExtension: "ifc" }));
    expect(await mirrorState(V, deps())).toMatchObject({ mirrored: false });
    expect(client.getFileVersionMetadata).not.toHaveBeenCalled();
    expect(client.updateFileVersionMetadata).not.toHaveBeenCalled();
  });

  it("two versions (or none) on the item: the tag is not known, nothing is written", async () => {
    for (const list of [[{ tag: "v2" }, { tag: "v1" }], [], null]) {
      client.listVersions = vi.fn(async () => list);
      const r = await mirrorState(V, deps());
      expect(r).toMatchObject({ mirrored: false });
      expect(r.reason).toMatch(/not one — the tag is not known$/);
    }
    expect(client.updateFileVersionMetadata).not.toHaveBeenCalled();
  });

  it("a label that already names this row or a newer one is left alone", async () => {
    client.getFileVersionMetadata = vi.fn(async () => ({ sentinel_state: "published", sentinel_state_row: "900" }));
    expect(await mirrorState(V, deps())).toEqual({ mirrored: false, reason: "the label already names ledger #812 or a newer state: row" });
    expect(client.updateFileVersionMetadata).not.toHaveBeenCalled();
  });

  it("a PUT the platform refuses resolves {mirrored: false, reason}, never rejects, and the log line names the version and item but never the token", async () => {
    client.updateFileVersionMetadata = vi.fn(async () => { throw new Error(`Cannot PUT /api/item/${ITEM}/version/v1/metadata?accessToken=${TOKEN}`); });
    const r = await mirrorState(V, deps());
    expect(r).toEqual({ mirrored: false, reason: `the platform or the ledger answered: Cannot PUT /api/item/${ITEM}/version/v1/metadata?accessToken=…` });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(new RegExp(`^\\[platform-state\\] version ${V} item ${ITEM}: not mirrored — `));
    expect(JSON.stringify([r, log.mock.calls])).not.toContain(TOKEN);
  });

  it("not configured, a ledger read that fails, a listing that throws: each resolves not mirrored", async () => {
    let d = deps();
    d.platform = vi.fn(async () => { throw new Error("Missing config: THATOPEN_API_KEY. Set them in config/.env (never commit it)."); });
    expect(await mirrorState(V, d)).toMatchObject({ mirrored: false, reason: expect.stringContaining("Missing config: THATOPEN_API_KEY") });
    sb = vi.fn(async () => { throw new Error("Supabase 500: {}"); });
    d = deps();
    expect(await mirrorState(V, d)).toMatchObject({ mirrored: false, reason: "the platform or the ledger answered: Supabase 500: {}" });
    expect(d.platform).not.toHaveBeenCalled();
    sb = vi.fn(async (path) => (path.startsWith("container_versions") ? [version] : [stateRow]));
    client.listVersions = vi.fn(async () => { throw new Error("fetch failed"); });
    expect(await mirrorState(V, deps())).toMatchObject({ mirrored: false, reason: "the platform or the ledger answered: fetch failed" });
    expect(client.updateFileVersionMetadata).not.toHaveBeenCalled();
  });
});

describe("the hooks — after a committed state change only, never awaited, never the transition's error", () => {
  const ANSWER = { id: 613, hash: "0".repeat(64), decision: "approve", step: 1, of: 1, name: "Coordination check", role: "contributor", published: true, state: "published" };
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "22222222-0000-4000-8000-00000000000b", email: "ana@example.test", role: "authenticated" })).toString("base64url") + ".sig";
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  const refusal = (code, message) => () => json({ code, details: null, hint: null, message }, 400);
  const settle = () => new Promise((r) => setTimeout(r, 50));
  const realFetch = globalThis.fetch;
  let rpc, warn;
  beforeEach(() => {
    process.env.SENTINEL_PLATFORM_STATE = "on";
    process.env.SENTINEL_MIRROR_TIMEOUT_MS = "20"; // a hung mirror releases the version's queue quickly here
    hookMirror.mockReset();
    hookMirror.mockImplementation(async () => ({ mirrored: true }));
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc = {
      cde_transition: (b) => json({ id: b.p_version, state: b.p_new_state, platform_item_id: ITEM }),
      review_decide: () => json(ANSWER),
    };
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(String(url));
      const path = u.pathname.replace(/^\/rest\/v1\//, "");
      if (path === "projects") return json([{ id: P, key: "aster-tower" }]);
      if (path.startsWith("rpc/")) return rpc[path.slice(4)](init.body ? JSON.parse(init.body) : null);
      if (path === "container_versions") return json([{ id: V, container_id: C, revision: "v2", state: "shared", information_containers: { project_id: P } }]);
      if (path === "information_containers") return json([{ iso_name: "Tower.ifc" }]);
      return json([]);
    });
  });
  afterEach(() => { globalThis.fetch = realFetch; warn.mockRestore(); delete process.env.SENTINEL_MIRROR_TIMEOUT_MS; });

  it("two mirrors of one version run one at a time (the second starts after the first settled)", async () => {
    let release;
    const order = [];
    hookMirror.mockImplementationOnce(() => new Promise((r) => { order.push("first started"); release = () => { order.push("first done"); r({ mirrored: true }); }; }))
      .mockImplementationOnce(async () => { order.push("second started"); return { mirrored: true }; });
    process.env.SENTINEL_MIRROR_TIMEOUT_MS = "5000";
    const { mirrorStateSafe } = await import("./cde-store.mjs");
    const a = mirrorStateSafe(V), b = mirrorStateSafe(V);
    await vi.waitFor(() => expect(order).toEqual(["first started"]));
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["first started", "first done", "second started"]);
  });

  it("a mirror that never answers releases the version's queue after the timeout", async () => {
    hookMirror.mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(async () => ({ mirrored: true }));
    const { mirrorStateSafe } = await import("./cde-store.mjs");
    expect(await mirrorStateSafe(V)).toEqual({ mirrored: false, reason: "the platform did not answer in 0.02 s" });
    expect(await mirrorStateSafe(V)).toEqual({ mirrored: true });
  });

  it("transition() mirrors the version once the RPC answered", async () => {
    expect(await transition(null, V, "shared")).toEqual({ id: V, state: "shared", platform_item_id: ITEM });
    await vi.waitFor(() => expect(hookMirror).toHaveBeenCalledWith(V));
  });

  it("a mirror that rejects: transition() still resolves with the row, and the rejection is one log line", async () => {
    hookMirror.mockImplementation(async () => { throw new Error(`boom ?accessToken=${TOKEN}`); });
    expect(await transition(null, V, "shared")).toEqual({ id: V, state: "shared", platform_item_id: ITEM });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0][0]).toBe(`[platform-state] version ${V}: not mirrored — boom ?accessToken=…`);
  });

  it("a mirror that never answers: transition() still resolves with the row", async () => {
    hookMirror.mockImplementation(() => new Promise(() => {}));
    expect(await transition(null, V, "published")).toEqual({ id: V, state: "published", platform_item_id: ITEM });
    await vi.waitFor(() => expect(hookMirror).toHaveBeenCalledWith(V));
  });

  it("a refused transition never reaches the mirror", async () => {
    rpc.cde_transition = refusal("P0001", "illegal transition wip -> published");
    await expect(transition(null, V, "published")).rejects.toMatchObject({ status: 409, message: "illegal transition wip -> published" });
    await expect(transition(null, "not-a-uuid", "shared")).rejects.toMatchObject({ status: 404 });
    await settle();
    expect(hookMirror).not.toHaveBeenCalled();
  });

  it("flag off: a committed transition mirrors nothing (platform-state.mjs is not even loaded on that path)", async () => {
    delete process.env.SENTINEL_PLATFORM_STATE;
    expect(await transition(null, V, "shared")).toEqual({ id: V, state: "shared", platform_item_id: ITEM });
    await settle();
    expect(hookMirror).not.toHaveBeenCalled();
  });

  it("reviewDecide() mirrors only after review_decide succeeded, and a hanging mirror never holds its answer", async () => {
    hookMirror.mockImplementation(() => new Promise(() => {}));
    expect(await runWithAuth(jwt, () => reviewDecide("aster-tower", V, { decision: "approve" }))).toEqual({ ...ANSWER, container_name: "Tower.ifc" });
    await vi.waitFor(() => expect(hookMirror).toHaveBeenCalledWith(V));
    hookMirror.mockClear();
    rpc.review_decide = refusal("P0001", "the submitter does not review their own share");
    await expect(runWithAuth(jwt, () => reviewDecide("aster-tower", V, { decision: "approve" }))).rejects.toMatchObject({ status: 409 });
    await settle();
    expect(hookMirror).not.toHaveBeenCalled();
  });
});
