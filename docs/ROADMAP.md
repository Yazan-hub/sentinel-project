# Sentinel roadmap after the hackathon

The founder's direction (2026-09-27): close the last trust gap, then make Sentinel ahead on **viewing models** and on
**every project dimension (2D–7D)** — enhancing and hardening each tool, not adding surface. One item at a time, each
with its spec, its checks and a live drill recorded in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; the
honesty rule holds throughout (nothing reported as passing that was not measured).

| # | Item | State |
|---|---|---|
| 1 | **H4 — per-user Revit sign-in** (the shared bridge token no longer speaks for everyone) | ✅ merged; drill B15; the user-attributed write seen in B16 (ledger #1093) |
| 1a | **Naming Manager finishes names from the model's facts** (founder's idea during B15) | ✅ merged 95a7c3c; drill B16 — 99 of 142 names proposed on aster-tower with their sources; the batch rename is the founder's |
| 1b | **Raise an issue from Revit** (founder's idea during B15) | ✅ merged 3c30fd7; drill B17 |
| 2 | **3D** — streaming fragments for large models, WebGPU where the browser has it, clash detection behind the Federation Gate, one model tree across federated models | exact clash ✅ (B18); Performance readout + federation Browser ✅ (B19); WebGPU blocked upstream (question to That Open); both models already camera-bound — the gate locks ⚑ Raise ✅; published in 1.0.26 (B20) — frame time measured (60 fps, p95 16.8 ms, integrated GPU) — no loading change needed at today's sizes, revisit with a large model; migration 0034 (founder) — spec `docs/superpowers/specs/2026-09-28-3d-viewer-design.md` |
| 3 | **Platform-native** — ledger rows for the That Open platform's gate verdicts; versions and folders per ISO 19650 state on the platform | — |
| 4 | **SDK upgrade + "Ask Sentinel"** — @thatopen/services, channels, notifications | — |
| 5 | **2D** — sheets on the Views engine, checked against the MIDP | — |
| 6 | **4D–7D** — 4D (MIDP ↔ elements, sequence), 5D (model quantities ↔ tender rates), 6D (carbon), 7D (COBie hand-over) | — |
| 7 | Delete dead code; H5 (the gate row via the bridge for signed-in callers), H3, H6 | — |

Owed by the founder, outside this list: the hackathon submission (deadline Sun 2026-10-04, midnight CEST); the
Naming Manager batch rename on his model; the drill issue and the platform test items left on `aster-tower`.
