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
import { createLimiter, createKeyedLimiter } from "./public-verify.mjs";
import { currentSub } from "./bridge-auth.mjs";

// config/.env is NOT loaded into process.env by this project — `loadEnv()` parses it and each module
// merges it (same pattern as cde-store.mjs), with the file authoritative over a stale shell var.
// Reading process.env directly here silently ignored every key in the file.
const env = { ...process.env, ...loadEnv() };

// ── providers ────────────────────────────────────────────────────────────────────────────────────
// `cloud: false` means it never leaves the machine. Everything else needs the opt-in above.
// For a cloud provider the list IS the allowlist (H0, D2): chat() refuses any other model, because every call is billed
// to the founder's key. For local it is the picker's defaults — Ollama serves whatever is pulled.
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
    // ⚠ TIER MATTERS, and the free tier is not safe for client work: Google's API terms say unpaid
    // content is used "to provide, improve, and develop Google products", that "human reviewers may
    // read, annotate, and process your API input and output", and explicitly "Do not submit
    // sensitive, confidential, or personal information to the Unpaid Services". The PAID tier states
    // the opposite ("Google doesn't use your prompts or responses to improve our products").
    // Project data must only go through a BILLING-ENABLED Gemini key.
    note: "Google. Large context. ⚠ Free tier trains on your data — use a billing-enabled key for real project data.",
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
    // NVIDIA rotates these often, and this list is exactly what chat() allows (H0) — update it here when a model is
    // retired (a retired one answers 404 at call time).
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

// H0 (D2): signed-in callers share one AI budget a minute, and each has their own — a per-user limit alone is bypassed
// by signing up again. Keyed on the verified sub (Funnel traffic all arrives from 127.0.0.1, so there is no per-IP);
// the machine credential (no sub) is not counted. ponytail: in-process fixed windows, reset on restart; past 1000 users
// the oldest user's window is dropped (createKeyedLimiter).
const AI_PER_MIN = Number(env.SENTINEL_AI_PER_MIN) || 60;
const AI_PER_USER_PER_MIN = Number(env.SENTINEL_AI_PER_USER_PER_MIN) || 20;
const aiShared = createLimiter({ max: AI_PER_MIN, windowMs: 60000 });
const aiPerUser = createKeyedLimiter({ max: AI_PER_USER_PER_MIN, windowMs: 60000, maxKeys: 1000 });
// Their own window first: a caller over it never spends the shared one.
const takeAiBudget = (sub) => !sub || (aiPerUser.take(sub) && aiShared.take());

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
  const p = Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : undefined; // "__proto__" is not a provider
  if (!p) return "Unknown provider.";
  if (!p.cloud) return null;
  if (id === "claude" && !keyOf(id) && !hasAnthropicProfile())
    return "Not signed in — run `ant auth login` to use your Claude account, or set ANTHROPIC_API_KEY in config/.env.";
  if (id !== "claude" && !keyOf(id)) return `No API key — set ${p.env} in config/.env and restart the bridge.`;
  if (!CLOUD_OPTIN) return "Cloud is off. Set SENTINEL_AI_CLOUD=1 in config/.env to allow it.";
  return null;
}

/** What the picker renders. Never leaks a key — only whether one is present, and not even that to a caller who may not
 *  use cloud AI (`cloudRefusal`: members-store canUseCloudAi's why): their cloud rows say only why not. */
export function listProviders({ cloudRefusal = null } = {}) {
  return Object.entries(PROVIDERS).map(([id, p]) => {
    const row = { id, label: p.label, cloud: p.cloud, models: p.models, note: p.note, auth: !p.cloud ? "none" : id === "claude" ? "login-or-key" : "key" };
    if (p.cloud && cloudRefusal) return { ...row, available: false, blocked: cloudRefusal };
    return {
      ...row,
      configured: p.cloud ? !!keyOf(id) || (id === "claude" && hasAnthropicProfile()) : true,
      available: blockedReason(id) === null,
      blocked: blockedReason(id),
    };
  });
}

/**
 * The models a picker offers. A cloud provider offers exactly its list above — the list chat() allows (H0, D2) — and is
 * never asked, so opening a picker spends nothing on the founder's key. Local asks Ollama what is pulled, curated
 * first; the static list on any error.
 */
export async function listModels(id) {
  if (!Object.hasOwn(PROVIDERS, id)) throw Object.assign(new Error("Unknown provider."), { status: 404 });
  const p = PROVIDERS[id];
  if (p.cloud || blockedReason(id)) return p.models;
  try {
    const url = (env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
    const r = await fetch(`${url}/api/tags`);
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name).filter(Boolean);
    if (!names.length) return p.models;
    // Curated first here too — Ollama lists in its own order, which put "llava" (a VISION model)
    // at the top and made it the chat default. Match loosely: a pulled model is "qwen2.5:7b-instruct"
    // while the curated name may be "qwen2.5" or vice-versa.
    const pref = p.models.flatMap((c) => names.filter((n) => n === c || n.startsWith(`${c}:`) || c.startsWith(`${n.split(":")[0]}`)));
    const seen = new Set(pref);
    return [...pref, ...names.filter((n) => !seen.has(n)).sort()];
  } catch {
    return p.models; // Ollama offline or an unexpected shape — the static list is still usable
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
export async function chat({ provider = "local", model, system, messages = [], tools = [], format } = {}, { budget = true } = {}) {
  const blocked = blockedReason(provider);
  if (blocked) throw Object.assign(new Error(blocked), { status: 400 });

  const p = PROVIDERS[provider];
  const chosen = model || p.models[0];
  // H0 (D2): a cloud call is billed to the founder's key — only a model on the list above, and only for a caller
  // members-store's canUseCloudAi trusts (the machine credential, or an office member); both before anything is sent.
  if (p.cloud) {
    if (!p.models.includes(chosen))
      throw Object.assign(new Error(`${p.label} model "${chosen}" is not on Sentinel's list — use one of: ${p.models.join(", ")}`), { status: 400 });
    const may = await (await import("./members-store.mjs")).canUseCloudAi();
    if (!may.ok) throw Object.assign(new Error(may.why), { status: 403 });
  }
  // Every signed-in caller's call counts, local too (it runs on the founder's GPU). `budget: false` is only for one
  // document ingest's chunks (bimdocs-ingest), whose route already required a trusted caller for the project.
  if (budget && !takeAiBudget(currentSub()))
    throw Object.assign(new Error("Too many AI requests — wait a minute, then try again."), { status: 429 });
  const out =
    provider === "local"  ? await viaOllama(chosen, system, messages, tools, format)
  : provider === "claude" ? await viaClaude(chosen, system, messages, tools, format)
                          : await viaOpenAiCompatible(provider, chosen, system, messages, tools, format);
  return { ...out, provider, model: chosen };
}

// ── Claude (official SDK — never a compatibility shim) ────────────────────────────────────────────
async function viaClaude(model, system, messages, tools, format) {
  // Passing apiKey:"" would DEFEAT the account-login path — the SDK resolves the OAuth profile only
  // when no key is supplied. Pass a key when there is one, otherwise let the SDK resolve credentials.
  const key = keyOf("claude");
  const client = key ? new Anthropic({ apiKey: key }) : new Anthropic();
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    // Adaptive thinking is the only supported on-mode on current models; budget_tokens is removed.
    thinking: { type: "adaptive" },
    ...(systemWithFormat(system, format) ? { system: systemWithFormat(system, format) } : {}),
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
async function viaOpenAiCompatible(provider, model, system, messages, tools, format) {
  const p = PROVIDERS[provider];
  const body = {
    model,
    max_tokens: 4096, // H0 (D2): capped as the Claude path is — an uncapped completion is billed in full
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    ...(tools.length ? { tools: tools.map(toOpenAiTool) } : {}),
    ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
  };
  let resp;
  try {
    resp = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${keyOf(provider)}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`${p.label} unreachable. Check your internet connection and ${p.env}.`),
      { status: 503, cause: err },
    );
  }
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
async function viaOllama(model, system, messages, tools, format) {
  const url = (env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  let resp;
  try {
    resp = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        ...(format === "json" ? { format: "json" } : {}),
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        ...(tools.length ? { tools: tools.map(toOpenAiTool) } : {}),
      }),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Local model unreachable. Is Ollama running, and is "${model}" pulled?`),
      { status: 503, cause: err },
    );
  }
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

/** Anthropic has no response_format flag — the instruction rides in the system prompt instead. */
const systemWithFormat = (system, format) =>
  format === "json" ? `${system || ""}\n\nReply with raw JSON only. No prose, no code fences.`.trim() : system;
