# Archive — historical snapshots

These documents are **point-in-time records** kept for lineage. They describe earlier stages of the project (the pyRevit prototype era, compile-only verification, dated work logs) and **do not reflect current state**. For where things actually stand, see the canonical docs from the [root README](../../README.md) — `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `CAPABILITY_MAP.md`, `ROADMAP.md`.

| File | What it was | Superseded by |
|---|---|---|
| `sentinel-project-summary.md` | Origin summary of the Phase-0 **pyRevit** prototype | `docs/PROJECT_OVERVIEW.md` |
| `sentinel-next-gen-roadmap.md` | Jul-2026 roadmap/killer-feature pitch (its core refactor is now built) | `ROADMAP.md`, `docs/roadmap.html` |
| `TEST_REPORT.md` | Test report (2026-07-15), "compile-verified, GUI needs manual confirm" | The loop is now verified live end-to-end |
| `TEST_A-Z.md` | Manual A→Z test script, "not run in Revit," v1.0.13 | Live Governed Publish pilot |
| `OVERNIGHT_REPORT.md` | Autonomous overnight work log (2026-07-16) | Current CDE / `CAPABILITY_MAP.md` |
| `SESSION_LOG.md` | Dated dev session notes (2026-07-13) | — (historical) |
| `CHAT_TRANSCRIPT.md` | Raw exported chat transcript (internal). Key already redacted in-tree | — (internal/historical) |

> **CHAT_TRANSCRIPT.md** had an API key that is redacted in the working tree. A leaked key is compromised regardless of file scrubbing — the mitigation is **key rotation**, not deletion. Do not publish this file externally.
