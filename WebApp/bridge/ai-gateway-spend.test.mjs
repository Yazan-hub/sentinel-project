// H0 (D2): a cloud AI call is billed to the founder's key — only a model on the provider's list, only for a caller
// members-store's canUseCloudAi trusts, with a capped reply; and every signed-in caller stays inside the AI budget.
// ai-gateway reads its env at import, so each test imports a fresh copy together with a fresh bridge-auth (runWithAuth
// and the gateway then share one auth context). fetch is stubbed in every test: nothing leaves the machine.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { canUseCloudAi } = vi.hoisted(() => ({ canUseCloudAi: vi.fn() }));
vi.mock("./members-store.mjs", () => ({ canUseCloudAi }));

const ENV = { GEMINI_API_KEY: "test-key", SENTINEL_AI_CLOUD: "1", SENTINEL_AI_PER_MIN: "5", SENTINEL_AI_PER_USER_PER_MIN: "3", OLLAMA_URL: "http://127.0.0.1:59996" };
const jwt = (sub) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub })).toString("base64url") + ".sig";
const hi = [{ role: "user", content: "hi" }];

let ai, runWithAuth, fetchStub;
beforeEach(async () => {
  vi.resetModules();
  Object.assign(process.env, ENV);
  canUseCloudAi.mockReset().mockResolvedValue({ ok: true, why: "office member" });
  // One reply both paths accept: Ollama reads .message, the OpenAI-compatible path reads .choices.
  fetchStub = vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: "ok" }, choices: [{ message: { content: "ok" } }] }) }));
  vi.stubGlobal("fetch", fetchStub);
  ({ runWithAuth } = await import("./bridge-auth.mjs"));
  ai = await import("./ai-gateway.mjs");
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  vi.unstubAllGlobals();
});
const as = (sub, fn) => runWithAuth(jwt(sub), fn);

describe("cloud calls (D2)", () => {
  it("a model not on the provider's list is refused 400 before anything is sent", async () => {
    await expect(as("u1", () => ai.chat({ provider: "gemini", model: "gemini-ultra-max", messages: hi })))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not on Sentinel's list/) });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("a caller canUseCloudAi refuses gets a 403 in its words; nothing is sent", async () => {
    canUseCloudAi.mockResolvedValue({ ok: false, why: "Cloud AI is for office members." });
    await expect(as("u1", () => ai.chat({ provider: "gemini", messages: hi })))
      .rejects.toMatchObject({ status: 403, message: "Cloud AI is for office members." });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("a trusted caller's call goes out with max_tokens, as the Claude path does", async () => {
    const out = await as("u1", () => ai.chat({ provider: "gemini", model: "gemini-flash-latest", messages: hi }));
    expect(out.text).toBe("ok");
    expect(JSON.parse(fetchStub.mock.calls[0][1].body)).toMatchObject({ model: "gemini-flash-latest", max_tokens: 4096 });
  });

  it("a caller canUseCloudAi refuses still spends their own AI-budget window (H0 minor N20) — the 4th of 3 is a 429, not a repeatable free 403", async () => {
    canUseCloudAi.mockResolvedValue({ ok: false, why: "Cloud AI is for office members." });
    for (let i = 0; i < 3; i++) await expect(as("u1", () => ai.chat({ provider: "gemini", messages: hi }))).rejects.toMatchObject({ status: 403 });
    await expect(as("u1", () => ai.chat({ provider: "gemini", messages: hi }))).rejects.toMatchObject({ status: 429 });
    expect(canUseCloudAi).toHaveBeenCalledTimes(3); // the 4th never reached the memberships read
  });

  it("a local call never asks canUseCloudAi; a name that is not a provider is a 400", async () => {
    await as("u1", () => ai.chat({ provider: "local", messages: hi }));
    expect(canUseCloudAi).not.toHaveBeenCalled();
    await expect(ai.chat({ provider: "__proto__", messages: hi })).rejects.toMatchObject({ status: 400 });
  });
});

describe("the AI budget (D2)", () => {
  it("each signed-in caller has a window of their own, one shared window caps them all, the machine credential is not counted", async () => {
    const call = (sub) => as(sub, () => ai.chat({ provider: "local", messages: hi }));
    for (let i = 0; i < 3; i++) await call("u1");                      // u1: 3 of 3 (shared: 3 of 5)
    await expect(call("u1")).rejects.toMatchObject({ status: 429 });  // over their own — the shared window is not spent
    await call("u2");
    await call("u3");                                                   // shared: 5 of 5
    await expect(call("u4")).rejects.toMatchObject({ status: 429 });  // room of their own, none shared
    for (let i = 0; i < 10; i++) await ai.chat({ provider: "local", messages: hi }); // no session: the machine credential
  });

  it("budget:false — one document ingest's chunks — is not counted", async () => {
    for (let i = 0; i < 10; i++) await as("u1", () => ai.chat({ provider: "local", messages: hi }, { budget: false }));
  });
});

describe("the pickers (D2)", () => {
  it("listModels for a cloud provider is its list — the provider is never called", async () => {
    expect(await ai.listModels("nemotron")).toEqual(ai.PROVIDERS.nemotron.models);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("listProviders with a refusal: cloud rows say why and not whether a key is armed; local is untouched", () => {
    const rows = ai.listProviders({ cloudRefusal: "Cloud AI is for office members." });
    for (const p of rows.filter((r) => r.cloud)) {
      expect(p).toMatchObject({ available: false, blocked: "Cloud AI is for office members." });
      expect(p).not.toHaveProperty("configured");
    }
    expect(rows.find((r) => r.id === "local")).toMatchObject({ available: true, configured: true });
  });
});
