// The Sentinel AI layer — ONE seam every AI feature calls, so the Copilot, the agent mode, and
// anything later share the same providers, the same privacy rule, and the same tool contract.
//
// PRIVACY (decision D-?? / GhostBuilder v2, 2026-07-22): **local is the default and cloud is strictly
// opt-in.** A cloud provider is only usable when BOTH are true: its API key is configured AND
// SENTINEL_AI_CLOUD=1 is set. A key sitting in .env is not consent — the switch is separate on purpose,
// so a key added for one thing can't silently start shipping model data somewhere.
//
// Keys live HERE, on the bridge, never in the browser (same reasoning as the Supabase service key —
// see docs/handbook/06-glossary.md "bridge = trust boundary"). The SPA calls /ai/chat; it never holds
// a provider key and never talks to a provider directly.
import Anthropic from "@anthropic-ai/sdk";
import { readdirSync } from "node:fs";
import { loadEnv } from "./thatopen-client.mjs";

// config/.env is NOT loaded into process.env by this project — `loadEnv()` parses it and each module
// merges it (same pattern as cde-store.mjs), with the file authoritative over a stale shell var.
// Reading process.env directly here silently ignored every key in the file.
const env = { ...process.env, ...loadEnv() };

// ── providers ────────────────────────────────────────────────────────────────────────────────────
// `cloud: false` means it never leaves the machine. Everything else needs the opt-in above.
// Model lists are the picker's defaults, not a whitelist — a caller may pass any model string.
export const PROVIDERS = {
  local: {
    label: "Local (Ollama)",
    cloud: false,
    models: ["qwen2.5:7b-instruct", "llama3", "qwen3.6"],
    note: "Runs on this machine. Nothing leaves it.",
  },
  claude: {
    label: "Claude",
    cloud: true,
    env: "ANTHROPIC_API_KEY",
    // claude-opus-4-8 is the current default per the Anthropic model catalog.
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
    note: "Anthropic. Strongest on long reasoning and vision.",
  },
  gemini: {
    label: "Gemini",
    cloud: true,
    env: "GEMINI_API_KEY",
    // Verified working on a current key 2026-07-23. NOT 2.5-* : gemini-2.5-flash is closed to new
    // users (404) and gemini-2.5-pro has no free-tier quota (429) — both look like outages, aren't.
    models: ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3-pro-preview"],
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    note: "Google. Large context, cheap.",
  },
  kimi: {
    label: "Kimi",
    cloud: true,
    env: "MOONSHOT_API_KEY",
    models: ["kimi-k2-0905-preview", "moonshot-v1-128k"],
    base: "https://api.moonshot.ai/v1",
    note: "Moonshot. Strong on very large document sets.",
  },
  nemotron: {
    label: "NVIDIA Nemotron",
    cloud: true,
    env: "NVIDIA_API_KEY",
    // Starting list only — NVIDIA rotates these often, so ask the provider rather than trusting
    // this: GET /ai/models?provider=nemotron returns whatever the key can actually reach today.
    models: [
      "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      "nvidia/nemotron-nano-9b-v2",
    ],
    base: "https://integrate.api.nvidia.com/v1",
    note: "NVIDIA NIM. Open-weight reasoning models; hosted API.",
  },
};

const CLOUD_OPTIN = String(env.SENTINEL_AI_CLOUD || "").trim() === "1";

// Claude can authenticate two ways: a pasted API key, or an ACCOUNT LOGIN (`ant auth login`), which
// stores an OAuth profile the SDK picks up from a bare `new Anthropic()`. The login path is what most
// people actually want — no key to copy, no key to leak, revocable from the account. Detect it so the
// provider reports itself available without a key.
function hasAnthropicProfile() {
  const dirs = [
    env.ANTHROPIC_CONFIG_DIR,
    process.env.APPDATA ? `${process.env.APPDATA}\Anthropic` : null,
    process.env.HOME ? `${process.env.HOME}/.config/anthropic` : null,
    process.env.USERPROFILE ? `${process.env.USERPROFILE}/.config/anthropic` : null,
  ].filter(Boolean);
  for (const d of dirs) {
    try { if (readdirSync(`${d}/credentials`).some((f) => f.endsWith(".json"))) return true; } catch { /* next */ }
  }
  return false;
}
const keyOf = (id) => (PROVIDERS[id]?.env ? String(env[PROVIDERS[id].env] || "").trim() : "");

/** Why a provider can't be used right now — null when it can. The UI shows this verbatim, so a
 *  misconfiguration explains itself instead of failing as a generic error at call time. */
export function blockedReason(id) {
  const p = PROVIDERS[id];
  if (!p) return "Unknown provider.";
  if (!p.cloud) return null;
  if (id === "claude" && !keyOf(id) && !hasAnthropicProfile())
    return "Not signed in — run `ant auth login` to use your Claude account, or set ANTHROPIC_API_KEY in config/.env.";
  if (id !== "claude" && !keyOf(id)) return `No API key — set ${p.env} in config/.env and restart the bridge.`;
  if (!CLOUD_OPTIN) return "Cloud is off. Set SENTINEL_AI_CLOUD=1 in config/.env to allow it.";
  return null;
}

/** What the picker renders. Never leaks a key — only whether one is present. */
export function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, label: p.label, cloud: p.cloud, models: p.models, note: p.note,
    auth: !p.cloud ? "none" : id === "claude" ? "login-or-key" : "key",
    configured: p.cloud ? !!keyOf(id) || (id === "claude" && hasAnthropicProfile()) : true,
    available: blockedReason(id) === null,
    blocked: blockedReason(id),
  }));
}

/**
 * Ask a provider which models the configured key can actually reach, instead of trusting the
 * hardcoded list above. NVIDIA in particular rotates its catalogue often, and a stale picker entry
 * fails as an opaque 404 at call time — far worse than an empty dropdown.
 * Falls back to the static list for `local` (Ollama has its own endpoint) and on any error.
 */
export async function listModels(id) {
  const p = PROVIDERS[id];
  if (!p) throw Object.assign(new Error("Unknown provider."), { status: 404 });
  if (blockedReason(id)) return p.models;

  try {
    if (id === "local") {
      const url = (env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
      const r = await fetch(`${url}/api/tags`);
      const j = await r.json();
      const names = (j.models || []).map((m) => m.name).filter(Boolean);
      return names.length ? names : p.models;
    }
    const r = await fetch(`${p.base}/models`, { headers: { authorization: `Bearer ${keyOf(id)}` } });
    if (!r.ok) return p.models;
    const j = await r.json();
    // Gemini returns ids as "models/gemini-3.6-flash"; the chat endpoint wants the bare name, so a
    // picker fed the raw id would 404 on every pick.
    const names = (j.data || []).map((m) => String(m.id || "").replace(/^models\//, "")).filter(Boolean);
    return names.length ? names.sort() : p.models;
  } catch {
    return p.models; // offline or an unexpected shape — the static list is still usable
  }
}

// ── the one call ─────────────────────────────────────────────────────────────────────────────────
/**
 * chat({provider, model, system, messages, tools}) -> {text, toolCalls:[{id,name,input}], provider, model}
 *
 * `messages` is [{role:"user"|"assistant", content:"..."}]. `tools` is the Anthropic tool shape
 * ({name, description, input_schema}) because it is the most explicit of the three, and the two
 * OpenAI-compatible providers convert from it cleanly — going the other way loses the schema's
 * `description` fields, which is exactly what the model needs to pick the right tool.
 *
 * Tools are what makes agent mode possible: the model returns a STRUCTURED PROPOSAL (toolCalls)
 * rather than prose, and the caller decides whether to run any of it. Nothing here executes anything.
 */
export async function chat({ provider = "local", model, system, messages = [], tools = [] }) {
  const blocked = blockedReason(provider);
  if (blocked) throw Object.assign(new Error(blocked), { status: 400 });

  const p = PROVIDERS[provider];
  const chosen = model || p.models[0];
  const out =
    provider === "local"  ? await viaOllama(chosen, system, messages, tools)
  : provider === "claude" ? await viaClaude(chosen, system, messages, tools)
                          : await viaOpenAiCompatible(provider, chosen, system, messages, tools);
  return { ...out, provider, model: chosen };
}

// ── Claude (official SDK — never a compatibility shim) ────────────────────────────────────────────
async function viaClaude(model, system, messages, tools) {
  // Passing apiKey:"" would DEFEAT the account-login path — the SDK resolves the OAuth profile only
  // when no key is supplied. Pass a key when there is one, otherwise let the SDK resolve credentials.
  const key = keyOf("claude");
  const client = key ? new Anthropic({ apiKey: key }) : new Anthropic();
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    // Adaptive thinking is the only supported on-mode on current models; budget_tokens is removed.
    thinking: { type: "adaptive" },
    ...(system ? { system } : {}),
    ...(tools.length ? { tools } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  // stop_reason must be checked before reading content — a refusal returns HTTP 200 with no text.
  if (res.stop_reason === "refusal")
    return { text: "The model declined to answer this request.", toolCalls: [], refused: true };

  return {
    text: res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
    toolCalls: res.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input })),
  };
}

// ── Gemini + Kimi (both expose an OpenAI-compatible chat-completions endpoint) ────────────────────
// One code path for two providers: the only differences are the base URL, the key, and the model
// string, so a second bespoke client would be duplication, not clarity.
async function viaOpenAiCompatible(provider, model, system, messages, tools) {
  const p = PROVIDERS[provider];
  const body = {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    ...(tools.length ? { tools: tools.map(toOpenAiTool) } : {}),
  };
  const resp = await fetch(`${p.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${keyOf(provider)}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    throw Object.assign(new Error(`${p.label} error ${resp.status}: ${detail}`), { status: 502 });
  }
  const json = await resp.json();
  const msg = json.choices?.[0]?.message ?? {};
  return {
    text: (msg.content || "").trim(),
    toolCalls: (msg.tool_calls || []).map((c) => ({
      id: c.id,
      name: c.function?.name,
      input: safeJson(c.function?.arguments),
    })),
  };
}

const toOpenAiTool = (t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema },
});

// ── Local (Ollama) ───────────────────────────────────────────────────────────────────────────────
// /api/chat (not /api/generate) because it is the one that supports tools + roles.
async function viaOllama(model, system, messages, tools) {
  const url = (env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const resp = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      ...(tools.length ? { tools: tools.map(toOpenAiTool) } : {}),
    }),
  });
  if (!resp.ok) {
    throw Object.assign(
      new Error(`Local model unreachable (${resp.status}). Is Ollama running, and is "${model}" pulled?`),
      { status: 503 },
    );
  }
  const json = await resp.json();
  return {
    text: (json.message?.content || "").trim(),
    toolCalls: (json.message?.tool_calls || []).map((c, i) => ({
      id: `local_${i}`,
      name: c.function?.name,
      input: typeof c.function?.arguments === "string" ? safeJson(c.function.arguments) : c.function?.arguments || {},
    })),
  };
}

function safeJson(s) {
  try { return typeof s === "string" ? JSON.parse(s) : s || {}; } catch { return {}; }
}
