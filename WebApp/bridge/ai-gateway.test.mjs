import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ai-gateway.mjs reads OLLAMA_URL into a module-level `env` object at IMPORT time
// (`const env = { ...process.env, ...loadEnv() }`), so each test that needs a different
// OLLAMA_URL must set process.env before a fresh dynamic import, using vi.resetModules().

describe("ai-gateway connection-level failures", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.OLLAMA_URL;
    vi.unstubAllGlobals();
  });

  it("viaOllama: nothing listening -> 503 with actionable Ollama message", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:59999";
    const { chat } = await import("./ai-gateway.mjs");
    await expect(
      chat({ provider: "local", system: "s", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Ollama") });
  });

  // viaOpenAiCompatible's provider (gemini/kimi) is blocked by blockedReason() unless its API key
  // AND SENTINEL_AI_CLOUD=1 are set, and we won't touch real credentials in a test. So the
  // connection-level fetch failure is exercised by mocking global fetch to reject, after forcing
  // the provider "open" via env vars — this hits the same try/catch as a real DNS/refused failure
  // without needing a live key or network access.
  it("viaOpenAiCompatible: fetch rejects -> 503 with actionable provider message", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.SENTINEL_AI_CLOUD = "1";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { chat } = await import("./ai-gateway.mjs");
    try {
      await expect(
        chat({ provider: "gemini", system: "s", messages: [{ role: "user", content: "hi" }] })
      ).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Gemini") });
    } finally {
      delete process.env.GEMINI_API_KEY;
      delete process.env.SENTINEL_AI_CLOUD;
    }
  });

  it("viaOllama: success path still returns {text, toolCalls} unchanged", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:59998";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: "hello there", tool_calls: [] } }),
      })
    );
    const { chat } = await import("./ai-gateway.mjs");
    const out = await chat({ provider: "local", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(out.text).toBe("hello there");
    expect(out.toolCalls).toEqual([]);
  });
});
