# Reports and questions for That Open (drafts — the founder sends them)

## 1. The app channel's two servers do not share rooms (measured 2026-09-29, twice) — FIXED by That Open, re-tested 2026-10-01

### The message to send (plain words)

> Hi That Open team! I found a bug in the app channel (`client.channel.external()`).
>
> **In short:** platform.thatopen.com runs on two servers, and they don't pass channel messages to each other. My open
> app connects to one of them. A script that sends my app a command also connects to one of them — and when it's the
> other one, the command is lost and the platform answers `delivered: 0`, as if the app were closed.
>
> **What I measured today:** with my app open, I sent the same command through each server, three times each. Only the
> server my app was connected to delivered it (3 of 3); the other delivered 0 of 3. When I reloaded the app and it
> connected to the other server, the result flipped. Following your quickstart exactly (no tricks), 8 commands in a row
> said "not delivered" while the app was open and working.
>
> Logs and a small script to reproduce it:
> https://github.com/Yazan-hub/sentinel-project/blob/master/docs/THATOPEN_REPORTS.md
>
> Happy to show it on a call.

### If they ask for more

**How it works, in one picture.** Each server keeps its own list of who is in a channel room. Nothing copies the lists
across, so a command reaches the app only when both sides picked the same server.

```mermaid
flowchart LR
  subgraph S1["server 3.69.132.147"]
    R1["room: project + app<br/>(members on THIS server)"]
  end
  subgraph S2["server 52.58.243.60"]
    R2["room: project + app<br/>(members on THIS server)"]
  end
  Tab["open app tab<br/>(dashboard socket)"] -- "joined" --> R2
  CLI1["script via 52.58.243.60"] -- "publish → delivered 1, reply" --> R2
  CLI2["script via 3.69.132.147"] -- "publish → delivered 0" --> R1
  R1 -. "no shared adapter" .- R2
```

**The measurements** (full log: [thatopen-evidence/2026-09-29-channel-rooms.log](thatopen-evidence/2026-09-29-channel-rooms.log);
times UTC, 2026-09-29 evening; the app tab is the published Sentinel app in Chrome; each ask is one `channelPublish`).

| Run | Situation | via 52.58.243.60 | via 3.69.132.147 |
|---|---|---|---|
| A 17:55 | no app tab open (baseline) | 0 of 2 | 0 of 2 |
| B 17:55 | tab opened, landed on 3.69.132.147 | 0 of 3 | **3 of 3**, app replied |
| C 17:56 | tab reloaded, stayed on 3.69.132.147 | 0 of 2 (+1 ask got no subscribe/ack at all) | **3 of 3**, app replied |
| D 17:56 | tab reloaded, landed on 52.58.243.60 — **the result flips** | **3 of 3**, app replied | 0 of 3 |
| E 17:57 | the quickstart's recipe as written (no pinning), app open | 0 of 8 (this PC's DNS kept choosing the other server) | |
| F 17:57 | the tab's channel reconnected by itself (no reload) and moved to 3.69.132.147 | delivered 1 but **no reply** for about a minute (stale member) | 3 of 3, app replied |
| G 17:58–18:00 | a minute later | 0 of 3 | 3 of 3, app replied |

The morning measurement (2026-09-29, before our workaround) showed the same thing the other way round: the tab's socket
on 52.58.243.60, asks via 52.58.243.60 → `delivered 1` three times, via 3.69.132.147 → `delivered 0` three times.

**Two more things we saw.**
1. *A stale member (run F).* When the dashboard's channel socket reconnects to the other server, the old server keeps
   counting the old socket for about a minute: `delivered: 1`, but the message reaches nothing. An external tool
   cannot tell that from a real delivery.
2. *A missing ack (run C).* One ask via 52.58.243.60 got neither `channel:subscribed` nor an ack within 10 s.

**Reproduce it yourself** (no Sentinel code needed beyond an open app):
[WebApp/scripts/thatopen-channel-repro.mjs](../WebApp/scripts/thatopen-channel-repro.mjs).
1. Open any app that joins `client.channel.external()` (SDK 0.16.1) in its platform project.
2. `npm i socket.io-client`, then
   `THATOPEN_TOKEN=<API token> THATOPEN_PROJECT_ID=<id> THATOPEN_APP_ID=<id> node thatopen-channel-repro.mjs 3`.
   It resolves platform.thatopen.com and asks through each address in turn, pinned with an `https.Agent({ lookup })`
   (TLS still checks the platform's name). Add `unpinned` as an address to ask the quickstart's way.
3. Reload the app tab and run it again; the address that delivers follows the tab.

A script cannot stand in for the app tab: a listener counts only when it connects with a signed-in session and
`&accountToken=true`, which an API token is refused (`channel:error "Unauthorized"`).

**What would fix it.** A shared socket.io adapter between the servers (e.g. the Redis adapter), so rooms and the
`delivered` count span both; or one channel endpoint with sticky routing. Every SDK user of
`client.channel.external()` meets this today.

**Our workaround.** Sentinel's asker asks on every address at once and keeps the first reply
(`WebApp/bridge/ask-sentinel.mjs`). Since 2026-10-01 it also connects WebSocket-only (see the re-test below).

### Re-test after That Open's fix (2026-10-01) — fixed; one new issue

Full log: [thatopen-evidence/2026-10-01-channel-after-fix.log](thatopen-evidence/2026-10-01-channel-after-fix.log).

- **Fixed.** platform.thatopen.com now resolves to one address (35.156.159.219); the two old servers refuse connections.
  24 of 24 WebSocket asks, each on a fresh connection, reached the open app and got its reply.
- **New: long-polling breaks behind the new balancer.** Several servers sit behind the one address and a new TCP
  connection can land on any of them; there are no sticky sessions. socket.io's default transport (long-polling first,
  as in the quickstart) sends follow-up requests that meet a server which never opened the session: HTTP 400
  `{"code":1,"message":"Session ID unknown"}` — 25 of 48 follow-up requests on new connections, 0 of 24 on one kept-alive
  connection. With the defaults, 0 of 7 asks got through; Sentinel's asker answered 1 of 5 before we switched it to
  WebSocket only (10 of 10 after).
- **Sentinel's side:** `WebApp/bridge/ask-sentinel.mjs` now connects with `transports: ["websocket"]`.
- **Repro:** [WebApp/scripts/thatopen-polling-repro.mjs](../WebApp/scripts/thatopen-polling-repro.mjs) (no dependencies):
  `THATOPEN_TOKEN=<API token> node thatopen-polling-repro.mjs 6`.

**The reply to send (plain words):**

> Thanks a lot — confirmed, the channel works now: 24 of 24 commands reached my open app and it answered every time.
>
> One thing the new setup broke: socket.io's default transport. Your one address now spreads connections over several
> servers with no sticky sessions, so long-polling (which socket.io tries first, and which the quickstart uses) often
> lands on a server that doesn't know the session and gets HTTP 400 "Session ID unknown" — about half the requests in
> my test, and 0 of 7 commands went through with the default settings. WebSocket-only works every time.
>
> Two easy fixes: turn on sticky sessions (session affinity) on the load balancer, or add `transports: ["websocket"]`
> to the quickstart's `io(...)` call. Log and a tiny repro script (no dependencies):
> https://github.com/Yazan-hub/sentinel-project/blob/master/docs/THATOPEN_REPORTS.md

### Re-test after That Open's second fix (2026-10-05) — both fixed

- **The name:** `platform.thatopen.com` resolves to two addresses again (3.69.132.147, 52.58.243.60 — the pair of 2026-09-29;
  2026-10-01 had one, 35.156.159.219).
- **Rooms shared across them (report 1):** with the published Sentinel app open in one tab, `sentinel.status` asked 10 times pinned
  to each address (WebSocket): **20 of 20 delivered to 1 tab and answered** (175-413 ms). On 2026-09-29 an ask on the other address
  than the tab's got `delivered 0`.
- **Long-polling sessions (the 2026-10-01 follow-up):** `WebApp/scripts/thatopen-polling-repro.mjs 12` — keep-alive 0 of 48 lost, a
  new connection per request **0 of 48 lost** (2026-10-01: 25 of 48 answered HTTP 400 "Session ID unknown").
- Two command-line clients in one project do not receive each other's messages on either address (the channel routes a `cli`
  publish to the app's room only) — expected, not a bug; noted so nobody re-tests it that way.
- Sentinel keeps asking on every address and over WebSocket only: harmless, and safe if the balancing changes again.

### The reply to send (plain words)

> Thanks — I re-tested today and both problems are gone. With the app open in one tab, messages sent through either of your two
> addresses (3.69.132.147 and 52.58.243.60) all reached it: 20 of 20. And socket.io long-polling no longer loses its session on a new
> connection: 0 of 48 failed, against 25 of 48 last week. Thanks for fixing it so quickly.

## 2. WebGPU (see ROADMAP item 2) — blocked upstream; question already raised.

## 3. Questions before the platform opens (drafted 2026-11-16) — the founder sends them

Context for the founder: these come from reading `@thatopen/services` 0.35.1 against what Sentinel uses
(`docs/strategy/2026-11-16-thatopen-engine-upgrade.md`, `docs/superpowers/specs/2026-11-16-revit-sync-gate-spike.md`).

### The message to send (plain words)

> Hi That Open team! Sentinel (a governance app on your platform, built by a Founding Member) is getting ready for the
> public opening. A few questions so we build on the right pieces:
>
> 1. **Collider.** Sentinel's exact clash uses `OBC.Collider` from components-beta 3.5.18. The public
>    `@thatopen/components` 3.6.0 does not export it. Will it become public, or should apps move to the services
>    `ClashesManager`?
> 2. **Revit collaboration.** Can an automation start on a new Revit commit (the per-commit
>    `revitflow_frag_<N>.frag`, or a new version of `revitflow_history.json`)? We would like to check every sync
>    against the project's IDS and record the result. Do commit `.frag` files carry property sets?
> 3. **Two add-ins.** Is your Revit add-in (1.3.1+) tested next to another add-in in the same Revit session?
> 4. **Apps for everyone.** When the platform opens, how will third-party apps like ours be found and installed by
>    other users? Is there a listing for Founding Members' apps?
> 5. **CDE and governance apps.** Your CDEManager, ClashesManager and topics panel are now built in. For an app that
>    adds review chains and an audit ledger on top, which of your stores should we treat as the source of truth?
> 6. **Licence and data.** Can you confirm in writing the licence of the beta packages, and where project files are
>    stored and how they are encrypted (region, at rest)? Our users' procurement asks.
> 7. **Limits.** Three automations per project on the free plan: is that the limit after the opening too?
>
> Thanks — happy to show Sentinel on a call.

### What each answer changes

| Question | If yes | If no |
|---|---|---|
| 1 Collider public | Move to the public engine in one step | Stay on beta, or move clash to `ClashesManager` (a design change) |
| 2 Automation on commits | Sync gate as a cloud component (option A of the spike) | The bridge watches the history (option B) |
| 3 Two add-ins tested | Spike step 2 is a confirmation | Spike step 2 is the main risk |
| 4 Listing | Publish the Delivery Gate as the free first touch | Distribution through the founder's own network |
| 5 Source of truth | Sentinel writes ISO states onto their files (already built, switched off: `SENTINEL_PLATFORM_STATE`) | Sentinel keeps its own CDE and mirrors |
