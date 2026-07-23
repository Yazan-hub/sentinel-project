# Turning on the cloud AI models

Five providers are wired. **Local (Ollama) already works and needs nothing.** The other four need a
key from you, plus one switch that turns cloud on at all.

| Provider | Key name | Where to get it |
|---|---|---|
| Local (Ollama) | — | already working |
| **Gemini** | `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| **NVIDIA Nemotron** | `NVIDIA_API_KEY` | https://build.nvidia.com → any Nemotron model → **Get API Key** |
| Claude | `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |
| Kimi | `MOONSHOT_API_KEY` | https://platform.moonshot.ai → API Keys |

## What to do

Open **`config/.env`** in Notepad (it's in the project folder; it already exists and holds your
That Open settings). Add your keys at the bottom, one per line, then save:

```
SENTINEL_AI_CLOUD=1
GEMINI_API_KEY=paste-your-gemini-key-here
NVIDIA_API_KEY=paste-your-nvidia-key-here
```

Add `ANTHROPIC_API_KEY=` and `MOONSHOT_API_KEY=` later when you have those.

Then **restart the bridge** (stop it and run `npm start` in the `WebApp` folder). Keys are only read
at startup.

### The `SENTINEL_AI_CLOUD=1` line is not optional

Without it, every cloud provider stays blocked **even with a valid key**. That is deliberate. Your
recorded privacy decision is *local by default, cloud strictly opt-in* — so a key on its own is not
treated as permission. One line, one place, easy to switch back off by deleting it.

## Checking it worked

Ask me to list the providers, or open `http://localhost:4100/ai/providers` in a browser. Each one
reports either `available: true` or the exact reason it isn't:

```
local     READY     Runs on this machine. Nothing leaves it.
gemini    READY     Google. Large context, cheap.
nemotron  READY     NVIDIA NIM. Open-weight reasoning models; hosted API.
claude    blocked   No API key — set ANTHROPIC_API_KEY in config/.env and restart the bridge.
```

If one says *"Cloud is off"*, the `SENTINEL_AI_CLOUD=1` line is missing. If it says *"No API key"*,
that provider's line is missing or misspelled.

## Which model to pick

The picker asks each provider what your key can actually reach, so the list is always current. Two
findings from setting this up that are easy to misread as outages:

- **Gemini:** `gemini-2.5-flash` is closed to new users (404) and `gemini-2.5-pro` has no free-tier
  quota (429). Working defaults on a current key: **`gemini-3.6-flash`** and `gemini-flash-latest`.
- **NVIDIA:** the key reaches ~118 models. `nvidia/llama-3.3-nemotron-super-49b-v1.5` is the default
  and is verified working; the full Nemotron family (nano-8b, super-49b, ultra-253b, vision, safety)
  is available.

## ⚠ Gemini: the free tier trains on what you send it

Checked against Google's API terms 2026-07-23. This is not a general caution — it is what the terms say:

| | Free (unpaid) | Paid (billing enabled) |
|---|---|---|
| Used to train/improve Google products | **Yes** | No |
| Human reviewers may read it | **Yes** | No |
| Google's own guidance | *"Do not submit sensitive, confidential, or personal information to the Unpaid Services"* | Logged briefly for abuse detection only |

The key currently configured is on the **free** tier (it hits free-tier quota limits). That is fine
for testing with the sample files. **Do not send real client project data through it** — enable
billing on the Google Cloud project behind the key first, which moves it to the paid terms.

The same question applies to every cloud provider: check whether the tier you are on trains on
input. Local (Ollama) is the only option where the question doesn't arise.

## Two safety notes

- **`config/.env` is gitignored** (verified) — your keys are never committed. Don't paste keys into
  a chat, a document, or a screenshot; the `.env` file is the only place they belong.
- **Model names are not hardcoded.** `GET /ai/models?provider=nemotron` asks the provider what your
  key can actually reach today, so NVIDIA rotating its catalogue can't leave you with a dropdown
  full of dead entries.
