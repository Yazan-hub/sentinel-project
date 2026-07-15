# Sentinel Platform

**A project-delivery operating system.** One BIM project, one governed dataset, from **tendering to
handover** — every dimension (2D–7D) a *view* of the same model, every lifecycle stage gated by
**standards-as-code**, with a grounded AI copilot and an owner/FM portal on top.

> Grew out of the **SentinelAddin** Revit plugin (standards engine, QA, delivery gate). This folder is the
> **web platform** — built on the open [That Open](https://thatopen.com) stack, so anyone can view and
> coordinate the model with **no Revit licence**.

---

## What you get (16 tabs, one dataset)

| | |
|---|---|
| **Project** | Lifecycle command center — live KPIs + stage gates |
| **Copilot** | Grounded, cited answers over the project's real data |
| **Standards** | Marketplace — install a pack → QA + gates enforce it |
| **QA** | Standards scan · health score · click-to-isolate |
| **Cost · 5D** | Model-driven BoQ + baseline/Δ change tracking |
| **4D** | Construction sequence — by trade or floor-by-floor |
| **6D** | Embodied carbon + hotspots + intensity |
| **7D** | Asset register + COBie handover + readiness gate |
| **Tender** | BoQ-driven tender + side-by-side bid comparison |
| **Issues / RFIs** | Coordination — BCF issues, clashes, RFIs, approvals |
| **Owner** | Read-only stakeholder / FM portal — the golden thread |
| **Explorer / Assets / Data / Settings** | The base viewer (tree, files, properties, data) |

---

## Quick start (pilot)

**Requirements:** [Node.js LTS](https://nodejs.org). Optional: [Ollama](https://ollama.com) (`ollama pull
llama3`, then `set OLLAMA_ORIGINS=*`) for the Copilot's free-form answers; the deterministic answers work
without it.

```powershell
# 1. Start the backend service (BCF issues, projects, RFIs, tenders, standards packs)
./start.ps1                 # or:  npm install ; npm start   (serves on http://localhost:4100)

# 2. Open the Sentinel app on the That Open Platform in your browser
#    (or run it locally:  npm run dev)

# 3. In the app: Assets tab → add an IFC/fragments model → then walk the tabs.
```

Leave the `start.ps1` window open — the Project, Copilot, Issues, RFIs, Tender, Owner and Standards tabs
all talk to that local service. See **[docs/PILOT.md](../docs/PILOT.md)** for the guided 15-minute first run.

---

## Configuration

Copy `.env.example` → `.env`:

- `VITE_SENTINEL_SERVICE` — where the app finds the service. `http://localhost:4100` (each user runs it
  locally) or `http://SERVER-HOST:4100` (one shared service for the office).
- Service env vars (`BCF_PORT`, `SENTINEL_OLLAMA_URL`, `SENTINEL_LLM_MODEL`) — set in the shell before
  `npm start`.

Data persists as JSON under `%AppData%\Sentinel\` (bcf-store, project-store, rfi-store, tender-store,
pack-store). Back up that folder to keep a pilot's coordination data.

---

## How it fits together

```
Revit (SentinelAddin plugin) ──IFC/BCF──►  Sentinel service (:4100)  ◄──► Web platform (this app)
  standards engine · QA ·                    /bcf /projects /rfis          2D–7D · gates · copilot ·
  delivery gate · GhostBuilder               /tenders /packs               tender · owner portal
```

The **standards pack** is the spine: extracted once (Revit Standards Engine), it drives the template build,
the QA scan, the stage gates, and the delivery gate — and it's shareable via the **Standards** marketplace.

## More docs
- **[docs/PILOT.md](../docs/PILOT.md)** — guided first run + troubleshooting.
- **[docs/TEST_A-Z.md](../docs/TEST_A-Z.md)** — full A→Z test script.
- **[docs/platform-vision.md](../docs/platform-vision.md)** — market analysis, architecture, roadmap.
- **[docs/phase1-spec.md](../docs/phase1-spec.md) … phase3-spec.md** — per-phase technical specs.
