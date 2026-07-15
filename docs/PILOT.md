# Sentinel Platform — Pilot Onboarding (first run in ~15 min)

For the person running a pilot at an office. Gets you from zero to "a project living A→Z in one place."

---

## 0. Prerequisites (once)
- **[Node.js LTS](https://nodejs.org)** — required (runs the service + build).
- **Optional — [Ollama](https://ollama.com)** for the Copilot's free-form answers and PDF standards ingest:
  `ollama pull llama3`, then set `OLLAMA_ORIGINS=*` (so the browser can reach it). The Copilot's built-in
  questions and everything else work **without** Ollama.
- **A model** — any IFC or `.frag`. A model exported *with quantity sets (Qto_)* lights up 5D/6D; one with
  building storeys lights up 4D-by-floor; one with COBie/FM psets lights up 7D. A plain design IFC still
  works — the panels honestly show what data is and isn't there.

## 1. Start the backend (30 sec)
```powershell
cd WebApp
./start.ps1            # or: npm install ; npm start
```
You should see `Sentinel BCF-API 3.0 listening on http://localhost:4100`. **Leave this window open.**

## 2. Open the app
- **Hosted:** open the Sentinel app on the That Open Platform (your published app), or
- **Local dev:** `npm run dev` in `WebApp` and open the URL it prints.

If panels say "can't reach the service", the `start.ps1` window isn't running — go back to step 1.

## 3. Load a model
**Assets** tab → add your IFC/`.frag`. It appears in the 3D viewer.

## 4. Walk the workflow (the A→Z tour)
1. **Standards** → install a pack (e.g. *BDS House Standard*). This becomes the project's rulebook.
2. **QA** → *Scan* → grade + violations (now enforcing the installed pack). Click a violation → it isolates.
3. **Cost · 5D** → *Take off* → live BoQ + total. *Baseline* it; later, change the model, take off again, press **Δ** to see the cost impact.
4. **Tender** → *New → Create from model BoQ* → enter a couple of bids → compare side-by-side → **Award**.
5. **4D** → *Trade* or *Level* → *Generate* → scrub / **▶** to watch the building rise.
6. **6D** → *Take off* → embodied carbon + hotspots + intensity.
7. **7D** → *Assets* → handover-readiness + missing-field chips → **COBie** export.
8. **Issues / RFIs** → select an element → raise one → it syncs to the Revit plugin (and back).
9. **Project** → the command center: KPIs + the **stage gate**. Close the open issues/RFIs, get 7D readiness up, then **Advance stage** — it only passes when standards-as-code says so.
10. **Owner** → the read-only stakeholder view: readiness ring + value + carbon + open items + searchable asset register.

That's the whole thesis: **one governed project, gated at every boundary, from tender to operate.**

---

## Multi-user / shared pilot
Run **one** service on a machine everyone can reach, then set `VITE_SENTINEL_SERVICE=http://THAT-HOST:4100`
in `WebApp/.env` and rebuild/redeploy. All users then share the same issues, projects, tenders and packs.
(For a single-user trial, the default `localhost:4100` per machine is simplest.)

## Data & backup
Everything persists as JSON under `%AppData%\Sentinel\`:
`bcf-store · project-store · rfi-store · tender-store · pack-store · ruleset · shared params · packs`.
Back up that folder to preserve a pilot's data; delete a `*-store.json` to reset that feature.

---

## Troubleshooting
| Symptom | Cause → fix |
|---|---|
| Panels: "can't reach the service" / `/packs` 404 | The service isn't running → `npm start` (step 1). |
| Copilot only answers built-in questions | Ollama not reachable → install it + `OLLAMA_ORIGINS=*`, or just use the built-in questions. |
| 5D/6D: "elements lack Qto_" banner on everything | The IFC was exported without quantities → re-export with quantity sets on. |
| 4D Level → "couldn't read storeys" | The IFC has no building-storey containment → use Trade mode, or re-export with spatial structure. |
| 7D readiness is 0% | Design-stage model has no manufacturer/serial/warranty yet — *correct*; these get filled during construction. |
| Revit: "publisher could not be verified" on load | The add-in is unsigned (dev build) → click "Always Load". |

## Revit side (optional)
The **SentinelAddin** plugin (standards engine, QA, GhostBuilder, delivery gate, BCF window) installs via
`SentinelAddin/INSTALL.md`. It compiles for Revit 2021–2027. The web platform works fully on its own — the
plugin adds the authoring-side governance + the two-way BCF sync.
