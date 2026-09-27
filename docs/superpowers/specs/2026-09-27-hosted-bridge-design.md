# The hosted bridge — design (H0–H6)

Status: the four decisions below were made by the founder on 2026-09-27. No sub-project is built yet. H0 comes first.

Sources: the 2026-09-27 mapping run (four lenses — runtime, identity, Revit, hosting — plus a synthesis) and the
2026-09-27 That Open hosting research (the `@thatopen/services` 0.3.11 SDK, public That Open sources, and a survey of
$0 hosts). Line numbers are the ones those reports cite.

How paths are cited: `bcf-service.mjs`, `cde-store.mjs` and the other `.mjs` files are in `WebApp/bridge/`. `.cs` files
are in `SentinelAddin/`. `0004:…`, `0016:…`, `0030:…`, `0031:…` and `0032:…` are Supabase migrations, cited by number.
No secret values appear in this document, only key names.

## Goal

Today the bridge runs only on the founder's PC. Two things follow from that:

- When the PC is off, asleep or restarted, the web app and every Revit install lose Sentinel. Nothing restarts the
  bridge (`install-autostart.cmd:9` starts the watcher only).
- A Revit on another PC cannot fully work. Revit writes sheets, views and the IFC outbox to its own `%APPDATA%`
  (`SheetExporter.cs:21-26`, `ViewExporter.cs:24`, `PlatformExporter.cs:19-26`). The bridge only reads its own disk.

The goal is a bridge that a second person, on a second PC, can use safely, each under their own name. First at $0 on
the founder's PC. Later, when there is budget, on an always-on host.

## Decisions (founder, 2026-09-27)

### 1. Revit identity: each person signs in with their own Sentinel account

The Revit add-in gets a sign-in (H4). Each Revit user signs in with the same Sentinel (Supabase) account they use on
the web.

Why:

- Today every Revit install holds the one shared `BCF_TOKEN`, in plain text in Roaming AppData
  (`BcfConfig.cs:23-24`). A caller without a user JWT gets the role `service` (`members-store.mjs:126-134`), and
  `requireMinRole` lets `service` through every check (`members-store.mjs:137-142`). So the token acts as owner on every
  project of every office. It can also call `DELETE /cde/projects/:key` and the keyless CDE routes with service-key
  power (`bcf-service.mjs:1022, 1085-1106, 1325-1349`). On a public address this is a god key held by strangers.
  Rotating it means touching every PC.
- The bridge already accepts a user JWT next to `BCF_TOKEN` (`bcf-service.mjs:472-478, 551-552`). So no bridge change is
  needed for Revit to send one. Membership and row-level security then apply per project (`cde-store.mjs:84-95`).
- The ledger gets a verified email instead of a self-declared name (`bridge-auth.mjs:28`). Today the names are
  `"Revit"` (`Publisher.cs:221`), `"revit:<WindowsUser>"` (`HealRecord.cs:27`, `StandardsBuilder.cs:359`), the Revit
  `Username` (`Commands.BcfIssues.cs:118`) and `"outbox"` (`cde-store.mjs:668`).
- Rejected: a device token per office. The machine path uses the service key, which bypasses row-level security
  (`cde-store.mjs:38-42`). Every route would need office scoping inside the bridge, the actor would still be
  self-declared, and everyone in the office would still be owner.
- Rejected: keeping the one shared `BCF_TOKEN` (reasons above).

What this costs:

- `POST /cde/:key/delivery-gate` accepts only the machine credential. A signed-in person gets a 403
  (`cde-store.mjs:910-912`). So the gate must be rebuilt as a gate the bridge measures itself (H5).
- Users below lead lose Standards Build/Apply (`artefact-store.mjs:233`) and the version stamp on `/propose`
  (`cde-store.mjs:1324-1328`).
- `BCF_TOKEN` stays only on the bridge's own machine, the founder's MCP server and CLIs, and the founder's own Revit
  while the change rolls out.
- **No external Revit user is onboarded until both H4 and H5 have shipped.**

### 2. Budget: $0 until Sentinel is ready to be sold to companies and offices

Nothing is paid for until then. Supabase stays on the Free plan.

What the Free plan means here (supabase.com/pricing, fetched 2026-09-27):

- 1 GB of file storage and a 50 MB maximum file size. So IFCs, attachments and renders cannot move into Supabase
  Storage. They stay on the bridge's disk.
- The project pauses after one week with no activity. While the bridge runs, its 3 s event poll keeps the project
  active (`bcf-service.mjs:290`).
- Free-plan backup terms were not checked in these reports.

### 3. Address and domain: none yet; buy one when needed (~$10/yr)

Until then the address is the Tailscale Funnel name under `*.ts.net`.

Why a domain later: the address is built into every web app build (`VITE_SENTINEL_SERVICE`, `WebApp/src/config.ts:7`)
and into every Revit PC's `bcf-config.json` (`BcfConfig.cs:15, 33`). With an owned name such as `bridge.<domain>`, a
later host move is only a DNS edit. About $10.44/yr for a .com at Cloudflare Registrar, $11.15 from 2026-11-01
(secondary source dated 2026-09-18). If the zone is on Cloudflare, the record must stay DNS-only (grey cloud), because
the Cloudflare proxy caps uploads at 100 MB.

What this costs: while the address is `*.ts.net`, moving to another host means publishing the web app again and
editing `serviceUrl` on every Revit PC. So buy the domain before the move to a paid host (H1–H2), and ideally before
many external PCs are set up.

### 4. Host: the founder's PC with Tailscale Funnel, at $0

The bridge stays on the founder's PC. It is reached from outside through Tailscale Funnel. The founder runs
`tools/public-bridge-on.cmd` to open it (`tailscale funnel --bg 4100`, `public-bridge-on.cmd:9, 14`) and
`tools/public-bridge-off.cmd` to close it (`tailscale funnel reset`, then `tailscale serve --bg 4100`,
`public-bridge-off.cmd:7, 10`).

Why:

- It costs nothing and needs no card and no code change. It is already proven.
- It is the only host where sheets, views and the outbox work today, because Revit writes them to the same PC
  (runtime map §3). This is true only for the Revit on that PC.
- Funnel is included in Tailscale's free Personal plan (tailscale.com/pricing, fetched 2026-09-27).

**That Open Platform cannot host the bridge.** In short (evidence in the next-but-one section):

- A cloud component is a run-once `main()` job. It takes only string and number parameters and returns only
  `{type: SUCCESS | FAIL | WARNING, message}`. It has no inbound address, no secrets store and no state between runs.
- A published app runs in a sandboxed iframe.
- Every caller would need a That Open token or login. That clashes with decision 1.

What can move to That Open later: one-off heavy jobs — IFC delivery-gate checks and IFC→fragments conversion — as cloud
components started by automations. The founder's TOP hackathon entry (plan A) takes the first step: it ports
`WebApp/bridge/delivery-gate.mjs` into a cloud component.

Fallbacks and the paid path:

- **Always-on $0 fallback, only if ever needed:** Oracle Cloud Always Free A1 (2 OCPU / 12 GB), with Funnel on the VM.
  It needs a card on file (not charged) and a phone number. Sheets and views break until H3, and the outbox until H5,
  because Revit is no longer on the same machine. Other catches: Oracle may reclaim a VM that is idle for 7 days, free
  VMs are often "out of host capacity", and Oracle halved the free allowance on 2026-06-15 without notice. The home
  region (Paris or Frankfurt) is chosen once, at sign-up.
- **Paid later:** a small always-on Linux host near Paris (Supabase is in eu-west-3, Paris) with at least 2 GB of RAM,
  plus the domain. About $14–28/month (see H1).

## Architecture now ($0: the founder's PC + Funnel)

```
  Web app                                   Revit on the founder's PC
  (published on platform.thatopen.com       (add-in; sends BCF_TOKEN today;
   in a sandboxed iframe, or the local app)  serviceUrl from bcf-config.json)
        |                                          |
        | HTTPS to <name>.ts.net                   | writes sheets, views, outbox
        v                                          | to %APPDATA%\Sentinel on the same PC
  Tailscale Funnel  (public-bridge-on.cmd)         |
        |                                          v
        +-------------> Bridge: node bridge/bcf-service.mjs, 127.0.0.1:4100
                        disk %APPDATA%\Sentinel: cde-files, bimdocs, sheets, views, JSON stores
                               |                               |
                               v                               v
                 Supabase Free, Paris (eu-west-3)     That Open Platform, one project
                 Postgres + auth + ledger             (THATOPEN_API_KEY): .frag models,
                 (service key, or the user's JWT)     viewer app

  Outbox watcher (watch-outbox.mjs, founder's PC): reads the outbox and talks straight to
  Supabase (SUPABASE_SERVICE_KEY) and That Open (THATOPEN_API_KEY). It does not use HTTP.

  Later at $0 (after H4, H3, H5): a second person's Revit on another PC -> Funnel -> bridge,
  signed in as that person, uploading sheets, views and IFC bytes over HTTP.
```

What is true of this setup today:

- The bridge is one plain `node:http` process (`bcf-service.mjs:15, 462-506`). It speaks HTTP/1.1 only (`:462`).
- The gate is armed. `BCF_TOKEN`, `SUPABASE_JWT_SECRET` (plus JWKS) and `SUPABASE_ANON_KEY` are all set in
  `config/.env` (identity lens §1). So a caller needs the Revit token or a verified Sentinel sign-in. Only `/health` and
  the hash-only public receipt check are open (`bcf-service.mjs:556, 583-592`).
- Anyone can create a Sentinel account (`members-store.mjs:78`), and any signed-up JWT passes the gate. **While Funnel
  is on, a stranger who knows the address can sign up and then:** call `/ai/*` and spend the founder's cloud AI keys
  (`bcf-service.mjs:636-648`); upload to the founder's That Open project through `POST /ifc` (`:945-964`); list every
  sheet and view set (`:669-759`); and watch any project's live events, because `/events` checks sign-in but not
  membership (`:604-618`). A viewer can also wipe a project's issues and encryption keystore through
  `DELETE /cde/projects/:key` (`cde-store.mjs:364-373`). H0 closes these. Until then, turning Funnel off when nobody
  outside needs it means fewer hours open to the internet.
- Funnel limits: ports 443, 8443 and 10000 only; a bandwidth limit that Tailscale does not publish; `*.ts.net` names
  only (tailscale.com/kb/1223/funnel, validated 2026-01-20). Upload speed is the PC's home upload speed.

## What moves to That Open, and what cannot

### The bridge itself cannot move

| What That Open offers | Why it cannot be the bridge | Evidence |
|---|---|---|
| A published **app** | Runs inside a platform iframe on an opaque origin. localStorage, IndexedDB and cookies throw. "Apps cannot hold their own connection." | `docs/cli/serve.md:9`; `docs/rate-limits.md:82-88`; `resources/AGENTS.md:42` (ThatOpen/platform_services, HEAD 2b975db) |
| A **cloud component** | One `async function main()`, called once per run. Parameters are only `"string"` or `"number"`. It returns only `{type, message}`; the platform stores a status word and one text message. No listening port, no inbound route. | `@thatopen/services` template `cloud-component/README.md:4, 8, 26, 107-114`; `svc/dist/types/execution.d.ts:7-8, 15` |
| Secrets | None. A publish uploads only the bundle and `declarations.json`. Anything built into the bundle can be downloaded again by anyone who can read the component. | `svc/dist/cli.js:10522-10530`; `client.d.ts:380-393` |
| State | Nothing lasts between runs except platform file storage. No database, key-value store or queue exists in the SDK. | SDK report §1–§2 |
| Triggers | An app, another component, or an automation: `file.uploaded`, `file.archived`, `file.updated`, `folder.created`, `automation.run.finished`, or a schedule (hourly, daily, weekly). No webhook, no HTTP trigger. | public bundle `platform.thatopen.com/assets/index-DNcOp8Ii.js`, fetched 2026-09-27 |
| Identity | Every caller needs a That Open API token or a That Open (Auth0) login. There is no way to plug in a Sentinel account, and no desktop sign-in flow. | `svc/docs/cli/login.md:9-14`; `platform-client.d.ts:18-34` |
| Address | No custom domain and no public or anonymous endpoint was found. | `docs/cli/serve.md:42`; `docs/ai-quickstart.md:280` |
| Free-account defaults | 512 MB memory per run, 60 minutes per run, 2 runs at once, 300 run-minutes per month, 5 GB storage, 10 components. Founding accounts show "Unlimited". These are client-side defaults in the bundle, not a published contract. | public bundle, `DEFAULT_EXECUTION_LIMITS` |

The bridge needs the opposite on every line: about 150 routes that the web app and Revit call at any time, live event
streams, the Supabase service key, a disk, and about 2 GB of RAM for large IFCs.

### What can move (later, one job at a time)

| Part | How | Catch |
|---|---|---|
| **Model storage** (.frag) | Already on That Open. The bridge uploads .frag files with `THATOPEN_API_KEY` (`thatopen-client.mjs:20-52`). Nothing to move. | One token and one platform project for the whole bridge (`thatopen-client.mjs:47-48`), so every Sentinel project's files land in the founder's one project. Uploads are limited to 30 writes a minute; a 429 means nothing was saved (`docs/rate-limits.md:21-32, 73`). |
| **IFC delivery-gate check** — the first step, via the hackathon entry (plan A) | Port `delivery-gate.mjs` into a cloud component. An automation starts it when an IFC is uploaded. It writes its report back as a file. | It cannot write to Supabase (no secrets store; outbound calls not confirmed), so the **bridge still records the gate on the ledger**. The result comes back only as a file. `checkDelivery` reads the whole IFC as one text string (`delivery-gate.mjs:103-135`); whether a large IFC fits in 512 MB is untested. Bundle the same `delivery-gate.mjs` the bridge uses, so the two cannot judge the same file differently. Never build a key into the bundle. |
| **IFC→.frag conversion** (the heaviest step) | That Open already ships a component, `IfcFragmenter`, found by name in the project (`svc/dist/built-in/index.d.ts:361-372, 487-496`). A `file.uploaded` automation could start it. | 512 MB and 300 minutes a month on the free default. Only a status comes back, so the bridge must watch for the result file. It saves one of the three web-ifc passes; the checks and the manifest still run on the bridge. Still beta (`--beta` required, `svc/docs/cli/create.md:22`). |
| **Live updates** (the platform "channel") | Relays messages between an open app tab and outside tools, and lists a Revit plugin as one (`docs/ai-quickstart.md:270-313`; `CHANGELOG.md:30`). | Works only while a Sentinel tab is open; otherwise `{ delivered: 0 }` and the message is lost. Each Revit user would need a That Open token. **It does not replace `/events`.** |

Watch-outs for component work: the local runner does not define `executionContext` and its reporter has no `error`
(`svc/dist/cli.js:11049-11056`), unlike the docs. Not known: whether a component can call outside servers, under whose
token it runs in the cloud, which tier the founder's account is on now, and That Open's general-access prices.

## Sub-projects, in the order they will be done at $0

The map lists H0–H6 in hosting order. At $0 the order changes: H1 and H2 (the paid host) wait for budget. When the bridge
stays on the PC, H3 and H4 no longer depend on H1, and H6 no longer depends on H2. Sizes are the map's.

| Order | Sub-project | When | Depends on (at $0) | Size |
|---|---|---|---|---|
| 1 | H0 hardening | now | nothing | S (1-2 days) |
| 2 | H4 Revit per-user sign-in | when a second person's Revit must work from another PC | H0 | M (4-6 days) |
| 3 | H3 sheets and views upload | same trigger | H0; H4 so uploads carry the user's identity | S-M (2-3 days) |
| 4 | H5 IFC bytes + bridge-measured gate; watcher retired | same trigger | H4 | L (1-2 weeks) |
| 5 | H6 onboarding | same trigger | H3, H4, H5 | S (1-2 days) |
| — | H1 container and deploy | only when there is budget | H0 | S-M (1-3 days) |
| — | H2 web cutover | only when there is budget | H1 | S (1 day) |
| — | Later: Storage buckets, second instance | after H6 and a budget trigger | H6 | L |

### H0 — hardening now (these also protect the PC bridge today)

Why now: while Funnel is on, the gaps in "Architecture now" are live. They are fine on a one-person PC and not fine on a
public address.

**The exact route list comes from the H0 route audit and the H0 plan.** The map's starting list is:

1. Refuse to start when `BCF_HOST` is not loopback and `BCF_TOKEN`, `SUPABASE_JWT_SECRET` or `SUPABASE_ANON_KEY` is
   empty. Today this is only a warning (`bcf-service.mjs:488`). An empty JWT secret lets any three-part bearer through
   (`:552`); with the anon key also empty, that caller runs on the service key (`cde-store.mjs:38-42`).
2. On SIGTERM, close the server so in-flight requests finish. Today there is no signal handler (runtime lens §0).
3. `DELETE /cde/projects/:key` requires owner before any side store is deleted (`bcf-service.mjs:1022`;
   `cde-store.mjs:364-373`).
4. `/events` checks membership of the project asked for (`bcf-service.mjs:604-618`).
5. `POST /ifc` requires membership (`bcf-service.mjs:945-964`).
6. `/ai/*` requires membership of at least one project and applies a per-user rate limit (`bcf-service.mjs:636-648`).
7. The document-ingest upload is capped at `MAX_DOC_UPLOAD`, not 2 GB. Today only the declared `content-length` is
   checked, so a chunked upload can reach 2 GB (`bcf-service.mjs:1502-1506`).

Each item gets one test. Size S (1-2 days). Depends on nothing.

### When a second person's Revit must work from another PC

Do these four together. Do not give an external person Revit access before H4 and H5 have both shipped.

#### H4 — Revit per-user sign-in

Scope (map):

- New `SentinelAddin/Coordination/UserSession.cs`, with no Revit or UI types (about 150 lines): email and password
  sign-in against Supabase's auth REST API (`/auth/v1/token?grant_type=password`), refresh
  (`grant_type=refresh_token`), and logout with `scope=local`.
  - The access token lives in memory only. The refresh token and email are stored with Windows DPAPI (CurrentUser) in
    `%LOCALAPPDATA%\Sentinel\session.dat` (Local, not Roaming).
  - A named mutex around read → refresh → write, and a re-read before each refresh. Supabase refresh tokens are
    single-use, and reuse revokes the whole session, so two Revit versions open at once would otherwise sign each
    other out.
  - A background loop refreshes about 5 minutes before expiry. The token getter never does I/O, because rows 3, 5 and
    13-15 of the Revit lens block Revit's UI thread.
- `BcfConfig.cs`: a `UserBearer` hook that `Load()` prefers over the file token. This one change covers GovernedQuery,
  GovernedNotify, LedgerResult, ArtefactClient, ChangesetClient and SettingsDialog. Keep the DPAPI code out of
  `BcfConfig.cs`, because six net8 check tools compile that file (`tools/publish-check/publish-check.csproj:27`).
- `BcfSyncManager` sets the header on each request, not once at construction (`BcfSyncManager.cs:27-36`). Otherwise the
  live stream reconnects with a stale token and gets a 401 every 3 s.
- `SignInDialog` (email, password, "Signed in as …"), a `SignInCommand`, and a ribbon button next to Project Setup
  (`App.cs:316-319`). DPAPI references in `Sentinel.csproj` (net48: `System.Security`; net8/10:
  `System.Security.Cryptography.ProtectedData`).
- `/health` also returns the Supabase URL and anon key (both public by design, `auth.ts:10-12, 18-23`), so Revit needs only
  `serviceUrl`.
- A 401 shows "signed out", not "bridge unreachable" and not a silent fall-back to the cache (`ArtefactClient.cs:124`;
  `Commands.Phase2.cs:177`; `Commands.ClashRegister.cs:30-36`; `SettingsDialog.xaml.cs:97-100`).
- The web's sign-out uses `scope: "local"` (`auth.ts:86`). Today it signs out globally, which would sign Revit out.
- Artefact `installed_by` goes through `resolveActor` (`artefact-store.mjs:239`), so it agrees with the ledger row.
- One check tool: DPAPI round trip, token precedence in `Load()`, and the expiry and refresh maths.

What changes for Revit once it sends a user JWT (identity and Revit lenses):

| Route | Today (`BCF_TOKEN`) | Signed in as a person |
|---|---|---|
| `POST /cde/:key/delivery-gate` (`Publisher.cs:190`, `Commands.IfcGate.cs:121`) | Allowed | 403 (`cde-store.mjs:912`). No gate row, and a gate FAIL is not held. Fixed by H5. |
| `/propose` with `register` (`Publisher.cs:220-224`, `AutoPublish.cs:108`) | Always registers and holds | Contributor or above registers under row-level security. A viewer gets a proposal row with no version, and the refusal is not held (`cde-store.mjs:856-860`). |
| `/propose` with `version_id` | Allowed | Lead only (`cde-store.mjs:1324-1328`) |
| `PUT /cde/:key/artefacts/:kind` (Standards Build/Apply) | Allowed | Lead only (`artefact-store.mjs:233`) |
| Office snapshot and scan | Allowed | Contributor or above (`office-store.mjs:115, 127`) |
| Project picker `GET /cde/projects` | Every project of every office | Only the user's projects (`cde-store.mjs:249-255`) |
| Journey, federation, artefacts, audit reads | Every project | Members only; others get 403 (`cde-store.mjs:84-95`) |
| `POST /cde/:key/audit`, changesets | Actor is the claimed name | Actor is the verified email (`bridge-auth.mjs:28, 39`; `changesets-store.mjs:99`) |
| BCF topics, comments, status | Every project | Any member, viewers included (`0016:41-44`) |
| Share a version into review | Refused (`0032:132-133`) | Newly possible for a lead |

Depends on: H0. (The map lists H1 because it assumed a host first. The PC bridge already accepts user JWTs, so H4 does
not need H1.) Size M (4-6 days).

#### H3 — sheets and views go to the bridge

Scope (map):

- `PUT /sheets/:projectKey/:set` and `PUT /views/:projectKey/:set` take the manifest and the PNGs. They need
  contributor or above, and write under the bridge's disk by project.
- The `GET` routes filter by project and check membership (`bcf-service.mjs:669-759`). Today every set is shown to any
  credential holder.
- `SheetExporter` and `ViewExporter` post after rendering and keep their local copy (`SheetExporter.cs:21-26`,
  `ViewExporter.cs:24`).
- The web sheets and views panels send the project key.

Depends on: H0; H4 first, so uploads carry the user's identity (the machine token works until then). Size S-M
(2-3 days).

#### H5 — IFC bytes and the delivery gate move to the bridge; the workstation watcher is retired

Why: the watcher runs on the Revit PC and calls `cde-store` directly with `SUPABASE_SERVICE_KEY` and `THATOPEN_API_KEY`
from `config/.env` (`watch-outbox.mjs:53-78`). It cannot run on an external PC without handing the service key to that
PC. And after H4, a signed-in Revit cannot post a gate row (`cde-store.mjs:912`).

Scope (map):

- Revit posts the exported IFC to the bridge.
- The bridge runs `checkDelivery` itself (`delivery-gate.mjs`, as intake does, `intake-logic.mjs:34-41`). It writes the
  `delivery_gate` row as its own measurement, with the verified email as submitter, for a signed-in contributor or
  above. This replaces the machine-only rule (`cde-store.mjs:910-912`) and restates spec Decision 5 with a stronger
  guarantee: the bridge measured the bytes, instead of trusting what Revit reported.
- The bytes wait on the bridge's disk (`staging`, by sha256). After `/propose` registers the version, the bridge does
  the watcher's steps: `uploadIfcAsFrag`, `attachGeometry`, `captureManifest` (`watch-outbox.mjs:50-78`;
  `platform-publish.mjs`). Then it deletes the staged file.
- `Publisher.Stage` and the outbox become a fallback only.
- The IFC Gate "check" command either uploads too, or records a row clearly labelled as person-reported.
- Workstations no longer need the service key or `THATOPEN_API_KEY`.

Link to That Open: once the gate check runs as a cloud component (the hackathon step), the bridge can later hand the
heavy part to it. The ledger row is still written by the bridge, and the bridge's answer is the one that counts.

Depends on: H4. Size L (1-2 weeks).

#### H6 — onboarding external people

Scope (map, adapted to the PC):

- A Revit config that ships only `serviceUrl` (the Funnel address at $0), with no token.
- Rotate `BCF_TOKEN` one last time, so any leaked copy stops working.
- Make Supabase sign-up invite-only, if the founder chooses that (open question).
- A short guide: install, sign in, Project Setup.
- One live walkthrough with a second account on a second machine (the B13 rows are still owed).

Depends on: H3, H4, H5. (The map also lists H2; at $0 the Funnel address takes its place.) Size S (1-2 days).

### Only when there is budget

#### H1 — container and deploy

Host (from the map; chosen when the budget exists):

| Host | About $/month | For | Against |
|---|---|---|---|
| Render Standard 1c-2g, Frankfurt, 10 GB disk | ~$27.50 (render.com/pricing, fetched 2026-09-27) | Least work. Requests up to 100 minutes (covers live streams and long intakes). Daily disk snapshots kept at least 7 days. Managed TLS and custom domain. | One instance per disk. Deploys with a disk are not zero-downtime, so a deploy drops live streams. Largest request body not documented. 5 GB bandwidth, then $0.15/GB. |
| Fly.io shared-cpu-1x 2 GB, cdg (Paris, same city as Supabase), 10 GB volume | ~$14 (docs.fly.io/about/pricing, fetched 2026-09-27) | About half the price, closest to the database. | A connection with no data for 60 s is closed (Fly staff, 2022-06-15); a long silent parse could be cut (inference). The volume sits on one server; Fly warns of data loss. Largest request body not documented. |
| Hetzner CX23 (2 vCPU, 4 GB) with Docker and Caddy | €5.99 before VAT | Twice the RAM. No platform limits. | You patch the OS and run firewall, backups and TLS on a box that holds the service key. Stock was flagged unavailable on 2026-09-04 (CX33 is the fallback). |

Rejected for the code as it is: Azure App Service and Container Apps (240 s response timeout), Google Cloud Run
(32 MiB per HTTP/1 request; the bridge is HTTP/1 only), DigitalOcean App Platform (no persistent disk), Cloudflare
proxy or Tunnel (100 MB upload cap). Free tiers of Render, Railway, Google, Koyeb and Fly are too small, sleep, or are
trials only.

Scope (map):

- A Dockerfile with Node 22. The code needs Node 20.11 or later (`import.meta.dirname`, `bcf-service.mjs:162`).
- Install only the bridge's six runtime packages (web-ifc, `@thatopen/fragments`, `@thatopen/services`, unpdf,
  mammoth, `@anthropic-ai/sdk`) into `WebApp/node_modules`, because the wasm path is read from there
  (`ifc-to-frag.mjs:12`). So no npm token and no esbuild `prepare` step (`build-fragments-worker.mjs:10`).
- **No `config/.env` in the image.** It would silently override the host's secret variables (`load-env.mjs:8-12`;
  `bcf-service.mjs:29`).
- Host environment: `APPDATA=/data` (one variable moves every default path, `bcf-service.mjs:92-172`;
  `bimdocs-ingest.mjs:23`); `BCF_HOST=0.0.0.0`; `BCF_PORT` as the host needs; a new `BCF_TOKEN`; the `SUPABASE_*` and
  `THATOPEN_*` keys; `BCF_CORS_ORIGIN`; `SENTINEL_AI_CLOUD=1` plus the cloud AI keys (no Ollama on a host,
  `ai-gateway.mjs:136`). Drop `SENTINEL_APPDATA_DIR`, `SENTINEL_CERT_FILE` (no reader) and the duplicate
  `SUPABASE_ANON_KEY`.
- A 10 GB disk at `/data`, a `/health` check, and a CNAME for `bridge.<domain>`.
- Acceptance test: intake of one 300 MB IFC, noting peak RAM and whether the request body gets through. If 2 GB runs
  out of memory, move to a 4 GB box (the image carries over).

Depends on: H0. Size S-M (1-3 days).

#### H2 — web cutover

Scope (map):

- Copy the JSON stores, bimdocs, sheets and views to `/data/Sentinel` on the host. The stores then move into Supabase
  the first time each is listed (`bcf-service.mjs:777-789, 817, 864, 908, 1641-1671`).
- Build and publish the web app with `VITE_SENTINEL_SERVICE=https://bridge.<domain>` (`config.ts:7`).
- Point every Revit `serviceUrl` and the MCP `BCF_BASE` at the host.
- Run `tools/public-bridge-off.cmd`.
- Replace `docs/HOSTING_TAILSCALE.md` with a hosting runbook. Two of its statements are stale: it says `/events` is
  unauthenticated (`:34-35`), and it says to leave `SUPABASE_JWT_SECRET` unset for ES256 (`:46-50`); JWKS checking now
  exists (`verify-jwt.mjs:1-11`).
- Do not move the 1.8 GB outbox. It is an archive, not live state.

Depends on: H1. Size S (1 day).

### Later (not needed to go hosted)

- Move `cde-files`, `bimdocs`, renders and, optionally, raw IFCs into private Supabase Storage buckets. This needs
  Supabase Pro (the Free plan caps files at 50 MB). No Storage code exists today (no `storage/v1` references in the
  bridge or `src`).
- Move intake parsing into `worker_threads`, so one big file does not stall everyone.
- Use `docReplaceIfField` (compare-and-swap, `cde-store.mjs:1513-1520`) for topic, RFI and clash writes.
- Only then run a second instance.

Depends on: H6 and a budget trigger. Size L.

## Risks

### Now (the PC + Funnel)

- **Live exposure while Funnel is on.** Open sign-up plus the gaps listed under "Architecture now" (`/ai/*`, `/ifc`,
  `/sheets`, `/views`, `/events`, `DELETE` project). H0 closes them.
- **The PC is the service.** Off, asleep or restarted means no Sentinel for anyone. Nothing restarts the bridge.
- **Only copies on one disk.** Encrypted CDE attachments, bimdocs originals, sheets and views exist only on the PC's
  disk (`bcf-service.mjs:89-108, 966-994`; `bimdocs-ingest.mjs:19-35`). No backup of them is described in these
  reports. The raw delivered IFCs exist only in the 1.8 GB `outbox\sent` folder; the platform holds only the .frag
  (`watch-outbox.mjs:113-145`).
- **Supabase Free pauses** after a week with no activity if the bridge is down that long. Free-plan backup terms were
  not verified, and the ledger is the product's evidence.
- **Undisclosed Funnel bandwidth limit** and the home upload speed limit large IFC uploads.
- **Memory.** A large IFC is held in RAM (`bcf-service.mjs:271-280`) and parsed up to three times by web-ifc
  (`intake-logic.mjs`; `bcf-service.mjs:1262-1265`). A crash drops every live stream and can leave a verdict on the
  ledger with no version, because intake writes the verdict before upload and registration
  (`intake-logic.mjs:41, 60, 98-106`).
- **One event loop.** While one intake parses, every other request and live stream waits. No bridge module uses
  `worker_threads`.
- **That Open is beta and its limits are not a contract.** The component defaults (512 MB, 300 minutes a month) come
  from a client bundle. The founder's tier and future prices are not known.

### With H4 and H5

- **Refresh-token hazards.** Two Revit versions open at once, or the web's global sign-out (`auth.ts:86`), sign the
  user out everywhere unless the mutex and `scope: "local"` changes land in H4.
- **Two gate judges.** Revit's C# gate and the bridge's `checkDelivery` could judge the same file differently once the
  bridge measures the gate (H5). The bridge's answer must win, and the difference must be shown, not hidden. A That
  Open gate component adds a third judge unless it bundles the same `delivery-gate.mjs`.
- **An orphan platform item.** For a viewer, intake may upload to the platform before registration fails under
  row-level security (`intake-logic.mjs:98-100`). Inferred, not confirmed.

### When hosted (H1–H2)

- A leftover `config/.env` in the image silently overrides the host's secrets (`load-env.mjs:8-12`).
- The Supabase service key lives on a third-party host. If it leaks, row-level security is bypassed for all offices.
  Limit dashboard access and turn on 2FA.
- One disk on one instance: a disk failure loses what was written since the last daily snapshot. Events emitted during
  a restart are never replayed (`bcf-service.mjs:446`).
- Undocumented limits: the largest request body on Render and Fly, whether Render bills ingress, and Fly's 60 s idle
  close during a silent parse.
- Latency: many sequential PostgREST calls per request (87 `sb()` call sites in `cde-store.mjs`). A host far from Paris
  adds to each one (inference, not measured).
- Old `*.ts.net` links and the published app 1.0.23 keep pointing at the PC until a new app build is published. Keep
  Funnel available until every client has moved.

## Open questions

1. **Invite-only sign-up.** Should Supabase sign-up become invite-only, with a lead adding people by email? Today
   anyone can create an account, and every account passes the bridge gate.
2. **Keep raw IFCs?** Must Sentinel keep the raw delivered IFCs? Today the only copy is the 1.8 GB `outbox\sent` folder
   on the PC. If yes, that needs Supabase Pro and an `ifc-originals` bucket (50 MB file cap on Free).
3. **One platform project, or one per office?** Should every office's models keep going into the founder's single That
   Open project under his API key (`thatopen-client.mjs:47-48`), or does each office get its own project and key?
4. **Who pays for AI?** Every user's cloud AI calls spend the founder's Gemini and NVIDIA keys, unless each office
   brings its own. A hosted bridge has no Ollama.
5. **Data residency.** Do any target clients require data to stay in-country (for example UAE or KSA government work)?
   That would rule out Frankfurt and Paris and point to Azure UAE North, whose 240 s timeout needs intake rewritten to
   run asynchronously.
6. **Supabase Pro timing.** Decision 2 keeps the Free plan until Sentinel is sold. Which event moves it to Pro (about
   +$25/month): the first external office's live data on the ledger, keeping raw IFCs, or backups?
7. **Signed-out Revit on the founder's PC.** Should it keep working with the shared token and self-declared names, or
   refuse governed writes as external installs will?
8. **SSO / Entra ID.** Do target offices use Microsoft Entra ID and expect single sign-on or MFA? That would add a
   browser sign-in (OAuth with PKCE) after H4's email and password sign-in. Supabase has no hosted email/password page,
   so PKCE works only with a provider such as Entra ID or Google.
9. **Funnel after cutover.** After H2, should the Funnel on the PC stay available as a manual fallback, or be removed?
