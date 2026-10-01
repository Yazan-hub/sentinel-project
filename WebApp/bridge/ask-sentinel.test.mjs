// ask() over a fake socket (spec 2026-09-29-sdk-ask-sentinel-design.md, phase 2): no network, no platform token.
import { describe, it, expect, vi } from "vitest";
import { ask, channelConfig, COMMANDS } from "./ask-sentinel.mjs";
import { TOOLS, callTool } from "./mcp-server.mjs";

const CFG = { token: "SECRET-TOKEN", projectId: "P", apiUrl: "https://platform.test" };

/** A socket.io-client stand-in: `onSubscribe`/`onPublish` play the platform's side once ask() emits. */
function fakeSocket({ onSubscribe = (s) => s.fire("channelMessage", { type: "channel:subscribed" }), onPublish } = {}) {
  const handlers = {};
  const s = {
    active: true, url: "", emitted: [], disconnected: false,
    on(ev, fn) { handlers[ev] = fn; return s; },
    emit(ev, data, ack) {
      s.emitted.push([ev, data]);
      if (ev === "channelSubscribe") queueMicrotask(() => onSubscribe(s, data));
      if (ev === "channelPublish") queueMicrotask(() => onPublish?.(s, data, ack));
      return s;
    },
    fire(ev, msg) { handlers[ev]?.(msg); },
    disconnect() { s.disconnected = true; },
  };
  return s;
}
const depsFor = (s) => ({ config: CFG, addresses: async () => [null], connect: (url) => { s.url = url; return s; } });

describe("ask — the asking side of the platform channel", () => {
  it("subscribes, publishes with an ack, keeps the FIRST reply to its own requestId, and hangs up", async () => {
    const s = fakeSocket({
      onPublish: (s, msg, ack) => {
        ack({ delivered: 2 });
        s.fire("channelMessage", { type: "reply", requestId: "someone-else", payload: { wrong: true } });
        s.fire("channelMessage", { type: "reply", requestId: msg.requestId, payload: { first: true } });
        s.fire("channelMessage", { type: "reply", requestId: msg.requestId, payload: { second: true } });
        s.fire("channelMessage", { type: "reply-error", requestId: msg.requestId, payload: { error: "late tab" } });
      },
    });
    const out = await ask({ appId: "APP", type: "sentinel.deliveries", payload: { name: "tower.ifc" } }, depsFor(s));
    expect(out).toEqual({ delivered: 2, answer: { first: true } });
    expect(s.url).toBe("https://platform.test?accessToken=SECRET-TOKEN");
    expect(s.emitted[0]).toEqual(["channelSubscribe", { projectId: "P", appId: "APP", kind: "cli" }]);
    expect(s.emitted[1][0]).toBe("channelPublish");
    expect(s.emitted[1][1]).toMatchObject({ type: "sentinel.deliveries", payload: { name: "tower.ifc" } });
    expect(s.emitted[1][1].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.disconnected).toBe(true);
  });

  it("delivered 0 is said in words — no appId for the dev app, and nothing is guessed", async () => {
    const s = fakeSocket({ onPublish: (_s, _m, ack) => ack({ delivered: 0 }) });
    await expect(ask({ type: "sentinel.status" }, depsFor(s)))
      .rejects.toThrow("Sentinel is not open (and joined) in platform project P under this account — not answered");
    expect(s.emitted[0]).toEqual(["channelSubscribe", { projectId: "P", kind: "cli" }]);
    expect(s.disconnected).toBe(true);
  });

  it("a reply-error is passed on in words", async () => {
    const s = fakeSocket({
      onPublish: (s, msg, ack) => { ack({ delivered: 1 }); s.fire("channelMessage", { type: "reply-error", requestId: msg.requestId, payload: { error: 'No handler for "sentinel.status".' } }); },
    });
    await expect(ask({ type: "sentinel.status" }, depsFor(s))).rejects.toThrow('Sentinel answered with an error: No handler for "sentinel.status".');
  });

  it("a timeout says where it stopped: never subscribed, or delivered with no reply", async () => {
    const never = fakeSocket({ onSubscribe: () => {} });
    await expect(ask({ type: "sentinel.status", timeoutMs: 20 }, depsFor(never)))
      .rejects.toThrow("not answered — the platform did not confirm the channel within 0.02 s");
    expect(never.disconnected).toBe(true);
    const silent = fakeSocket({ onPublish: (_s, _m, ack) => ack({ delivered: 1 }) });
    await expect(ask({ type: "sentinel.status", timeoutMs: 20 }, depsFor(silent)))
      .rejects.toThrow("not answered — delivered to 1 Sentinel tab(s) in platform project P, but no reply within 0.02 s");
  });

  it("every error is scrubbed: a refused connection echoing the socket URL, a reply-error carrying a JWT", async () => {
    const refused = fakeSocket({ onSubscribe: (s) => { s.active = false; s.fire("connect_error", new Error(`xhr poll error at ${s.url}`)); } });
    const e1 = await ask({ type: "sentinel.status" }, depsFor(refused)).catch((e) => e);
    expect(e1.message).toMatch(/^not asked — the platform refused the connection: /);
    expect(e1.message).toContain("accessToken=[scrubbed]");
    expect(e1.message).not.toContain("SECRET-TOKEN");
    const leaky = fakeSocket({
      onPublish: (s, msg, ack) => { ack({ delivered: 1 }); s.fire("channelMessage", { type: "reply-error", requestId: msg.requestId, payload: { error: "401 Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1IjoieCJ9.sig" } }); },
    });
    const e2 = await ask({ type: "sentinel.status" }, depsFor(leaky)).catch((e) => e);
    expect(e2.message).toBe("Sentinel answered with an error: 401 Bearer [scrubbed]");
  });

  it("a transient connection error keeps trying until the timeout, and the timeout names it", async () => {
    const flaky = fakeSocket({ onSubscribe: (s) => s.fire("connect_error", new Error("websocket error")) });
    await expect(ask({ type: "sentinel.status", timeoutMs: 20 }, depsFor(flaky)))
      .rejects.toThrow("did not confirm the channel within 0.02 s (last connection error: websocket error)");
  });
});

describe("ask — the platform's channel servers do not share their rooms: every address is asked", () => {
  const A = { address: "10.0.0.1", family: 4 }, B = { address: "10.0.0.2", family: 4 };
  const twoServers = (behave) => {
    const sockets = {};
    return {
      sockets,
      deps: {
        config: CFG, addresses: async () => [A, B],
        connect: (_url, opts) => {
          // Which server this socket reached: the pinned agent's lookup names it.
          let addr; opts.agent.options.lookup("platform.test", {}, (_e, a) => { addr = a; });
          expect(opts.forceNew).toBe(true);
          expect(opts.transports).toEqual(["websocket"]); // long-polling breaks behind the platform's balancer
          return (sockets[addr] = fakeSocket({ onPublish: (s, msg, ack) => behave[addr](s, msg, ack) }));
        },
      },
    };
  };
  const answers = (s, msg, ack) => { ack({ delivered: 1 }); s.fire("channelMessage", { type: "reply", requestId: msg.requestId, payload: { here: true } }); };
  const empty = (_s, _m, ack) => ack({ delivered: 0 });

  it("the tab on the second server answers although the first says delivered 0; both sockets hang up", async () => {
    const { deps, sockets } = twoServers({ "10.0.0.1": empty, "10.0.0.2": answers });
    await expect(ask({ type: "sentinel.status" }, deps)).resolves.toEqual({ delivered: 1, answer: { here: true } });
    expect(Object.keys(sockets).sort()).toEqual(["10.0.0.1", "10.0.0.2"]);
    expect(sockets["10.0.0.1"].disconnected && sockets["10.0.0.2"].disconnected).toBe(true);
  });

  it("'not open' only when every server says so; else the more telling reason", async () => {
    await expect(ask({ type: "sentinel.status" }, twoServers({ "10.0.0.1": empty, "10.0.0.2": empty }).deps))
      .rejects.toThrow("Sentinel is not open (and joined) in platform project P under this account — not answered");
    const silent = (_s, _m, ack) => ack({ delivered: 1 });
    await expect(ask({ type: "sentinel.status", timeoutMs: 20 }, twoServers({ "10.0.0.1": empty, "10.0.0.2": silent }).deps))
      .rejects.toThrow("not answered — delivered to 1 Sentinel tab(s) in platform project P, but no reply within 0.02 s");
  });
});

describe("channelConfig", () => {
  it("the channel token wins over the API key; config/.env wins over the environment; the token is required", () => {
    expect(channelConfig({ THATOPEN_CHANNEL_TOKEN: "c", THATOPEN_API_KEY: "k", THATOPEN_PROJECT_ID: "P" }, {}))
      .toEqual({ token: "c", projectId: "P", apiUrl: "https://platform.thatopen.com" });
    expect(channelConfig({ THATOPEN_CHANNEL_TOKEN: "", THATOPEN_API_KEY: "k" }, { THATOPEN_CHANNEL_TOKEN: "stale" }).token).toBe("k");
    expect(channelConfig({}, { THATOPEN_API_KEY: "env" }).token).toBe("env");
    expect(() => channelConfig({}, {})).toThrow(/THATOPEN_CHANNEL_TOKEN or THATOPEN_API_KEY/);
  });
});

describe("MCP sentinel_ask_app", () => {
  it("is registered, and points the model at sentinel_audit (platform_gate) when Sentinel is not open", () => {
    const t = TOOLS.find((t) => t.name === "sentinel_ask_app");
    expect(t.inputSchema.required).toEqual(["type"]);
    expect(t.inputSchema.properties.type.enum).toEqual(COMMANDS);
    expect(t.description).toMatch(/sentinel_audit with entity_type platform_gate/);
  });

  it("calls ask() as the mcp kind, and refuses any other command before asking", async () => {
    const fake = vi.fn(async () => ({ delivered: 1, answer: { ok: true } }));
    const out = await callTool("sentinel_ask_app", { type: "sentinel.deliveries", payload: { name: "a.ifc" }, app_id: "APP" }, { ask: fake });
    expect(out).toEqual({ delivered: 1, answer: { ok: true } });
    expect(fake).toHaveBeenCalledWith({ type: "sentinel.deliveries", payload: { name: "a.ifc" }, appId: "APP", kind: "mcp" });
    await expect(callTool("sentinel_ask_app", { type: "sentinel.delete" }, { ask: fake })).rejects.toThrow(/type must be one of sentinel\.status, sentinel\.deliveries/);
    expect(fake).toHaveBeenCalledTimes(1);
  });
});
