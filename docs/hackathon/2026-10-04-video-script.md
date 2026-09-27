# TOP Founding Members Hackathon — Sentinel entry: video script (5 min or less, silent, captions)

Rules that bind the recording: the whole browser stays visible with the platform header and its URL
(`platform.thatopen.com/dashboard/projects/6a4c4df825f9ecf5f416d4c2/…`) at all times; no audio; at most five minutes;
one entry. Submission form: https://thatopen.notion.site/3e3e915dff1e80e896c5f944549ce5f7 — deadline Sunday
2026-10-04, midnight CEST. The short description and the community profile URL go in the form (the description is
below).

Title card (0:00, 5 s): **Sentinel Delivery Gate — the platform project refuses what the contract refuses.**

| Time | On screen | Caption (bottom, one line) |
|---|---|---|
| 0:05 | That Open's CDE app, the Welcome Project's file list with `.ifc` files | An IFC lands in the project. Is it deliverable? Nobody knows until someone opens it. |
| 0:20 | Sentinel app ▸ Project Settings ▸ Standards in force ▸ contract ▸ Install JSON… (pick the contract file) | A lead installs the delivery contract in Sentinel: one file — schema, required entities, forbidden proxies, property sets. |
| 0:35 | the Settings note: `✓ contract@1 installed … · also on the platform as sentinel-contract.json contract@1` | The contract travels to the platform project by itself. |
| 0:50 | Workspace ▸ Apps & Components: the **Sentinel Delivery Gate** component row, `Enabled projects 1` | A Sentinel cloud component holds the gate — the same code the Revit add-in and the bridge run. |
| 1:05 | Project ▸ Automations: the two rows `Sentinel gate — new file`, `Sentinel gate — new version` | Two automations start it on every IFC that lands: a new file, a new version. |
| 1:20 | That Open's CDE app: drag the failing IFC in (the Demo Tower export that fails on 994 proxies) | A consultant uploads straight into That Open's CDE. No Sentinel needed on their side. |
| 1:40 | Automations ▸ ⋮ ▸ View runs: the run appears, `Reading …`, then `[WARNING] Refused — contract@1 (…) — 1 failure: IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.` | Five seconds later the platform has judged it. |
| 2:00 | the CDE app: the file's version, its labels `sentinel_gate fail · sentinel_contract contract@1 · sentinel_failures 1 · sentinel_sha256_a/b`, and `<name>.gate.json` beside it | The verdict is written on the file itself: labels on the version, and a report with the exact sentences. |
| 2:15 | Sentinel app ▸ Coordination ▸ CDE: the **Platform deliveries** strip, the card **Refused — contract@1 — 1 failure**, `✗ IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.`, `sha256 … · run …` | Sentinel's board shows it in the words the contract uses. Nothing to interpret. |
| 2:40 | the CDE app: upload the corrected IFC as a new version | The consultant fixes the model and uploads a new version. |
| 2:55 | View runs: `SUCCESS Passed — contract@1 (…)`; the strip card **Passed — contract@1**, the sha256 | Passed. The report carries the file's SHA-256 — the same fingerprint Sentinel's ledger uses. |
| 3:20 | Revit: the Sentinel pane ▸ Publish (Governed Publish) on the pilot model; the dialog's `Contract: contract@1 · …` line | From Revit, a publish through Sentinel is judged first by the add-in… |
| 3:45 | the platform project: `<name>.frag` and `<name>.ifc` appear; View runs shows the run; the strip shows the card | …and again on the platform, from the same code, on the same bytes. Two judges, one contract. |
| 4:05 | another platform project with no `sentinel-contract.json`: upload an IFC; View runs: `Not checked — no contract on the platform project — install one in Sentinel`; the card **Not checked** | With no contract there is no verdict. Sentinel never reports a pass nobody measured. |
| 4:30 | the report JSON open: `result`, `contract.ref`, `failures`, `sha256`, `run.executionId` | Every verdict names its contract, its failures, its bytes and its run. |
| 4:45 | title card | Sentinel — ISO 19650 information management. Governance that runs on the platform. |

Short description (the form): *Sentinel is ISO 19650 information management for Revit and the web: states, review
chains, delivery contracts, a hash-chained ledger. This entry moves the delivery gate onto That Open Platform: a
Sentinel cloud component judges every IFC that lands in a project — uploaded through That Open's CDE, a new version, or
published from Revit through Sentinel — against the contract the lead installed, started by automations, and writes the
verdict onto the file itself (a report version and labels). Sentinel's board shows Passed, Refused with the exact
sentences, or Not checked when no contract exists — it never reports a pass nobody measured.*

Before recording: publish app 1.0.24 to the sandbox; link the Sentinel project used on screen to the platform project;
install the contract there (the Settings line must say `also on the platform`); have the failing and the corrected IFC
ready; the Funnel on for the Revit scene; rehearse once with a stopwatch (the table above runs to 4:50).
