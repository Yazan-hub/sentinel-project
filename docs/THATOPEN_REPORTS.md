# Reports and questions for That Open (drafts — the founder sends them)

## 1. The app channel's two servers do not share rooms (measured 2026-09-29)

**What happens.** An external tool asks an open app over the channel (`channelSubscribe {projectId, appId}` →
`channelPublish` with an ack). The ack is `{delivered: 0}` about half the time although the app is open and joined,
and `{delivered: 1}` (with the app's reply) the rest of the time.

**Why (measured).** `platform.thatopen.com` resolves to two addresses (3.69.132.147 and 52.58.243.60, TTL 44 s). With
the asking socket pinned to one address at a time, three rounds each: via 52.58.243.60 → `delivered 1`, via
3.69.132.147 → `delivered 0`, every time. The app's page socket (the dashboard's `channelSocketSubscription`) had
landed on 52.58.243.60. The channel rooms (and the delivered count) look local to each server — no shared adapter
between them — so an ask reaches the app only when both sockets land on the same server.

**Repro.** Open any app that joins `client.channel.external()` (SDK 0.16.1); from Node, connect `socket.io-client` to
`https://platform.thatopen.com?accessToken=<API token>` with an `https.Agent({ lookup })` pinned to each address in
turn, `channelSubscribe {projectId, appId, kind: "cli"}`, then `channelPublish {type, requestId}` and read the ack.

**Our workaround.** Sentinel's asker asks on every address and keeps the first reply. It would be better fixed
server-side (a shared socket.io adapter, e.g. Redis, or sticky routing for channel rooms) — every SDK user of
`client.channel.external()` hits this today.

## 2. WebGPU (see ROADMAP item 2) — blocked upstream; question already raised.
