# The Next strip — design (cohesion graft after phase 3)

Status: approved 2026-09-24; amended after the plan cross-check (stale federation is todo, the Revit scan line reads
`App.Engine.Ruleset`, failed standards reads and no-screen steps have their own wording). Source: `docs/reviews/cohesion-review-2026-09-23.md` §5 ("Grafts from the other
two proposals": the Engagement Spine's Next strip — "a pure `journey-logic.mjs` over stored facts, with a step
'done' only when an evidence id exists, rendered atop the dockable pane and the web project space with a
'standard in force' line … it replaces the static Guide layout"), `docs/CAPABILITY_MAP.md` ("guide panel is built
but static (no live-data wiring)"). Builds on phases 1–3 (artefact store and resolver, office entity, ruleset and
naming artefacts). The backlog's add-in gate ("nothing starts on the add-in until the running test session
closes", `docs/FEATURES_UPDATE_2026-09.md:5-7`) is open: that session was the Aster simulation run, finished
2026-09-23 with its pilot files restored.

## Goal

One read-only answer to "which standards are in force here, where are we, and what is next", computed once on
the bridge from stored facts and shown on both surfaces: a strip under the web project-space header and a strip
at the top of the Revit dockable pane. The web Guide tab's top section becomes the full step list with evidence.

Definition of done: *on `aster-villa` the web strip and the Revit pane both show the same three standard refs
(`ids@n · office`, `ruleset@1 · office`, `naming@1 · office`), the same "n of 8" count and the same next step; every
done step names its evidence; the Revit pane also says which ruleset the machine actually scans with and whether
it matches the project's `ruleset@n`.*

## Approaches considered

1. **The bridge computes the journey; both surfaces render the same JSON** *(chosen)*. One truth, the logic is
   pure and unit-tested, Revit stays a thin reader.
2. Each surface computes its own journey from existing routes. Two implementations (TS and C#) of the same rules
   — the scatter the cohesion review exists to remove.
3. Fold the journey into the readiness assessment. Readiness is an office document with declared answers and a
   plan; the journey is live and per project. Mixing them overloads both.

## Design

### 1. The journeys (pure `WebApp/bridge/journey-logic.mjs`)

`buildJourney(facts) → { kind, steps, next, done, total }`, no I/O. `facts` is gathered by the route (§2). The
step list depends on `facts.project.kind` (phase 2's `projects.kind`).

**Office journey** (`kind: "office"`)

| id | Label | Done when the facts hold | Evidence |
|---|---|---|---|
| `team` | Team in place | an `owner` and a `lead` membership row | the member rows' user ids, roles |
| `standards` | Office standards installed | `ids`, `ruleset` and `naming` each installed **on the office itself** (source `project` when resolved on the office key) | the three `kind@n` refs with sha |
| `snapshot` | Template snapshot received | the office snapshot exists (`office-store.getSnapshot`) | `snapshot · <template title> · <at>` |
| `readiness` | Readiness assessed | a `READINESS` document exists (`bimdocs-store.listDocs`) | the document id and version count |
| `projects` | First project attached | at least one project row has `office_key = key` (`office-scope.projectScope`) | the child keys |

**Project journey** (`kind: "project"`)

| id | Label | Done when the facts hold | Evidence |
|---|---|---|---|
| `team` | Team in place | an `owner` and a `lead` membership row | member user ids, roles |
| `standards` | Standards in force | `ids`, `ruleset`, `naming` each resolve (project or office) | the three refs with source and sha |
| `bep` | BEP drafted | a `BEP` document exists | document id |
| `model` | Model connected | a Revit scan report exists for the key (`office-store.getScan`) | `scan · <model title> · <at>` |
| `verdict` | First governed verdict | any `verdict:*` audit row on a `file_version` (`cde.versionVerdicts` / audit) | the audit id and version id |
| `published` | Accepted and published | a live version in state `published` whose latest verdict is `accepted` | version id + verdict audit id |
| `federated` | Federated | `federation/latest` exists with `result.verdict === "pass"` and is not stale (a stale pass is todo: "the live set changed since; re-run the gate") | `federation · pass · <at>` |
| `issued` | Issued | at least one transmittal (`cde.listTransmittals`) | the transmittal id |

Statuses: `done` (the predicate holds **and** an evidence object with a non-empty `ref` exists), `todo`,
`not_checkable` (the fact source for that step failed, or the step cannot apply yet — `federated` when no live model
exists: "no live model — nothing to federate"; since 2026-09-28 (option B) one live model follows the gate like several,
and a pass counts only when it judged every live model). `next` is the id of the first step, in list
order, whose status is `todo`; `null` when none. `done` and `total` are counts; **no percentage** anywhere. A step
never becomes `done` from a count or a flag without an evidence ref. Each step also carries `how`: `{ web: {tab,
hint} | null, revit: string | null, who: "owner" | "lead" | "member" }` — static text naming where the step is
done (e.g. `revit: "Sentinel ▸ Governed Publish"`, `web: {tab: "Documents", hint: "New ▸ BEP"}`).

### 2. The route (`GET /cde/:key/journey`)

`WebApp/bridge/journey-store.mjs` `getJourney(key, deps)` gathers the facts in parallel with `Promise.allSettled`
(a rejected source marks only its own step `not_checkable` with the error message as reason), calls
`buildJourney`, and adds the standards line:

```json
{
  "key": "aster-villa", "kind": "project", "office_key": "aster-office",
  "standards": {
    "ids":     { "ref": "ids@4", "source": "office", "sha256": "…", "label": "ids@4 · office · 23bb57937fb0…", "standard_key": null, "semver": null },
    "ruleset": { "ref": "ruleset@1", "source": "office", "sha256": "…", "label": "…", "standard_key": "ast-std-001", "semver": "1.0.0" },
    "naming":  { "ref": "naming@1", "source": "office", "sha256": "…", "label": "…", "standard_key": "ast-std-001", "semver": "1.0.0" }
  },
  "steps": [ { "id": "team", "label": "Team in place", "status": "done", "evidence": { "ref": "…", "label": "owner …, lead …" }, "reason": null, "how": { … } } ],
  "next": "federated", "done": 6, "total": 8
}
```

`label` comes from `refLabel` (phase 3); a kind with nothing installed is `{ ref: null, source: "none", label:
"none" }`. Deps are injected (the `artefact-store` idiom) so the gatherer is unit-tested without Supabase. Member
rows are read without the per-member e-mail lookup `listMembers` does (the strip polls; use the row reader). Role:
any member of the project (the same `ensureProject` membership check every `/cde/:key/*` read has).

### 3. Web

- **Strip** (`WebApp/src/setups/next-strip.ts`, `nextStrip({ baseUrl, onOpenTab })`): mounted in `main.ts`
  between the project-space header and the tabs, so it shows on every project tab. Line 1: `Standards in force:
  IDS <label> · Rules <label> · Naming <label>` (a `none` kind reads "none — install from Settings/Packs"; a failed read shows its `unavailable — …` label, never
  the install hint; a step with no screen reads "no screen for this step yet").
  Line 2: `Next: <label> — <hint>` with an **Open** button when `how.web` names a project-space tab (switches
  via the existing `tabbed()` `showTab(i)`), plus `<done> of <total> ▸ Journey` which opens the Guide sidebar tab.
  Refreshes on `onActiveProjectChange` and on a ↻ button. On a bridge failure it shows "Journey unavailable —
  <message>", never stale data.
- **Guide** (`guide-panel.ts`): a live section above the static content lists every step with its status mark,
  evidence label and `how`; the existing feature topics stay below under "All features". It reuses the strip's
  fetcher (`fetchJourney(base, key)` exported from `next-strip.ts`).

### 4. Revit

- `GovernedQuery.Journey(string? projectKey) → JourneyInfo?` (never throws, same 4 s client and bearer as
  `FederationStatus`): parses `standards`, `next` step label and hint, `done`, `total`.
- `SentinelPanel.xaml`: a strip `Border` above the score block with three `TextBlock`s bound to `JourneyKey`,
  `StandardsLine`, `NextLine`, a fourth bound to `ScanRulesetLine`, and a ↻ button.
- `SentinelPanelViewModel.RefreshJourney(string projectKey, string localStandardKey, string localSemver)`: runs
  the GET on a background task and sets the properties through the existing `OnUi`. `ScanRulesetLine` = `Scans
  here with <local standard_key> <semver> (this machine) — matches ruleset@n` or `— differs from ruleset@n ·
  <source> (<standard_key> <semver>)`, or `— the project has no ruleset installed`. This line exists because until
  phase 4 the pane's violations are judged by the machine's ruleset, not the project's artefact; the strip must not
  imply otherwise.
- Callers read the key and the local ruleset **on the Revit API thread** (`SettingsManager.WebProjectKeyFor(doc)`,
  `App.Engine.Ruleset`, the ruleset that actually judged the pane's rows) and pass strings to `RefreshJourney`: after every `PublishReport` call site in
  `App.cs` (document opened, full scan) and from the ↻ button through the existing external-event path the pane
  already uses for Select/Fix. No Run buttons; nothing is written.

### 5. Honesty

`done` needs an evidence ref; `not_checkable` carries its reason; counts not percentages; the standards line
names ref · source · sha exactly as the judges do; the Revit scan line tells the truth about which ruleset judged
the pane's rows.

## Testing

- `journey-logic.test.mjs`: both journeys; each step done/todo from minimal facts; `done` refused without an
  evidence ref; `federated` follows the gate for one live model and needs a pass covering every live model; `next` is the first todo; counts.
- `journey-store.test.mjs`: gatherer with injected deps; one rejected source → that step `not_checkable` with the
  message, the others unaffected; standards labels via `refLabel`; `none` kinds.
- Web: `next-strip.test.ts` for the pure line builders (standards line, next line, open-tab mapping); tsc and build.
- Revit: `dotnet build … -p:DeployToRevit=false`; the scan-line composer as a pure static method.
- Live drill (Session B4 in `docs/TESTING_PROTOCOL.md`): `GET /cde/aster-villa/journey` and `/cde/aster-office/
  journey` (office journey 5 steps); web strip on `aster-villa` if the platform loads (else the route stands);
  Revit pane on a document bound to `aster-villa` shows the same refs and next step and the scan line (Revit
  must be closed to deploy).

## Out of scope

Run buttons, any write from the strip, the lifecycle stage gate (phase 5), the MCP server, per-user journeys,
a percentage or score, notifications.

## Files

- Create: `WebApp/bridge/journey-logic.mjs` + test, `WebApp/bridge/journey-store.mjs` + test,
  `WebApp/src/setups/next-strip.ts` + test.
- Modify: `WebApp/bridge/bcf-service.mjs` (route), `WebApp/src/main.ts` (mount), `WebApp/src/setups/guide-panel.ts`,
  `SentinelAddin/Coordination/GovernedQuery.cs`, `SentinelAddin/UI/SentinelPanel.xaml`,
  `SentinelAddin/UI/SentinelPanelViewModel.cs`, `SentinelAddin/App.cs` (refresh after scans),
  `docs/TESTING_PROTOCOL.md`, `docs/handbook/05-capability-status.md`, `docs/CAPABILITY_MAP.md` (guide line).
