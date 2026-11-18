# UX slice 3 — words on screen: check log (2026-11-18)

Branch `feature/ux-words`. Rules: `docs/ux/web-words.md`. Old → new table: `docs/ux/web-words-changes.csv` (698 rows).
Strings that keep an internal word on purpose (stored or hashed text, codes, format names, AI/agent text):
`WebApp/src/ux-words-left.json`, guarded by `WebApp/src/ux-words.test.ts`.

Live check in the platform's local app (Chrome), web served from the branch, bridge still master's (so bridge
sentences such as the LOD line and "Run gate" show the old words until the bridge restarts on the merged code).

| # | Where | Expected | Seen |
|---|---|---|---|
| 1 | Home ▸ Overview, project cards | "n files" instead of "n containers" | ✅ "0 files", "6 files", "10 files" ([hub-cards-files.jpg](ux-slice3/hub-cards-files.jpg)) |
| 2 | Next strip, "Standards in force" | names only; versions and fingerprints in a closed Details | ✅ "Data requirements (project) · Project standards (office) · Naming (project)" + Details holding `ids@3 · project · f94b14eb0fe2…`, `ruleset@2 · office · d67053d5a6ae…`, `naming@2 · project · 396c98474a27…` ([strip-standards-details.png](ux-slice3/strip-standards-details.png)) |
| 3 | Documents ▸ Files | no internal words in the list | ✅ |

Not seen live: bridge sentences (old bridge running), error Details (no error raised during the check). They are
covered by tests (full suite) and the guard.
