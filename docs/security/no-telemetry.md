# No telemetry: what the bridge and the Revit add-in contact

Date: 2026-10-20. Evaluation §4A1 point 5. Test: `WebApp/bridge/no-telemetry.test.mjs` (runs in CI with the rest of the
vitest suite). Spec: `docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md` §4.

## The statement

Neither the bridge nor the Revit add-in sends telemetry, usage data or crash reports to Sentinel or to anyone else.
There is no Sentinel server to send it to: the bridge runs on the office's own PC.

## What each one contacts

| Host | Who | When |
|---|---|---|
| this PC (`127.0.0.1`, `localhost`) | bridge, add-in | the bridge itself; the local AI (Ollama); the web app's dev server |
| the Supabase project (`SUPABASE_URL`) | bridge; add-in for sign-in only | every CDE read and write (bridge); signing in (add-in) |
| the bridge address in this PC's settings | add-in | every Sentinel call from Revit |
| `platform.thatopen.com` (or `THATOPEN_API_BASE_URL`) | bridge | uploads, gate reads, the app channel |
| `generativelanguage.googleapis.com`, `api.moonshot.ai`, `integrate.api.nvidia.com`, Anthropic's API (through its SDK) | bridge | only a cloud AI call: its key set, `SENTINEL_AI_CLOUD=1`, a trusted caller, and a project whose AI policy allows cloud AI |
| the web evidence sources in `WebApp/bridge/web-sources.mjs` | bridge | MA-7 web evidence: off until the founder's `SENTINEL_WEB_EVIDENCE` switch, then only on a lead's request, only from that list |
| a model off this PC | add-in | only when this PC opted in ("Allow a model off this PC", https only) and the open model's project is not locked to this network |

`www.w3.org` and `standards.buildingsmart.org` appear in the code as XML namespaces in BCF and IDS files. They are
never fetched. The add-in's code names no host but this PC: its bridge and sign-in addresses come from this PC's
settings (Standards ▸ PC Settings).

## How it is proven

1. **Every host the code names is filed.** The test reads every `http(s)://host` in `WebApp/bridge/*.mjs` (tests aside)
   and `SentinelAddin/**/*.cs`. Each must be on the test's list with its reason (the table above). A new host fails CI
   until a person files it.
2. **No telemetry SDK.** No package in `WebApp/package-lock.json` and no `PackageReference` in any `.csproj` matches a
   telemetry or crash-reporting library (Sentry, Application Insights, PostHog, Segment, Mixpanel, Amplitude, Datadog,
   New Relic, Bugsnag, Rollbar, OpenTelemetry exporters and others).
3. **The running bridge reaches only what it was given.**
   - The test boots a copy of the bridge with Supabase, That Open and Ollama on local stub servers.
   - A preload patches `net.Socket.prototype.connect`. Every outgoing TCP connection passes through it: http, https,
     tls and `fetch` alike.
   - Each attempt is logged. One to an address the bridge was not configured with is destroyed before it opens (deny
     by default). The preload was also checked by hand: a `fetch` to an outside host is refused and logged.
   - The bridge then boots and answers `/health`, the AI routes (`/ai/providers`, `/ai/models`, `/ai/tools`,
     `/ai/policy`, `/ai/chat` local and a refused cloud call) and the CDE routes (`/cde/projects`, `/bcf/3.0/projects`).
   - It passes when no refused attempt is in the log, and the Supabase and Ollama stubs saw traffic through the guard,
     so the empty list is not vacuous.

## Limits

- The runtime guard sees TCP connections, which is how every HTTP, HTTPS and `fetch` call leaves. A DNS lookup, a UDP
  packet or a child process's own connections are not in its log. The readers the bridge runs on this PC as child processes
  (the Python survey and drawing readers in `survey/` and `drawing/`) are outside both proofs: proof 1 reads the bridge's
  own code only.
- The runtime proof covers boot and the routes listed above. A route that is not exercised is covered by proof 1
  (every host it could name is filed), not by a run.
- The add-in is proven statically only: CI has no Revit. Its HTTP clients take their address from this PC's settings
  and refuse a non-https address off this PC (`UrlRule`, SEC-3).
- Supabase, That Open and the AI providers keep their own logs of the calls Sentinel makes to them. Their terms
  govern that, not Sentinel. For cloud AI, point the customer to their own agreement with the provider.
- The web app (a browser page published on That Open) is out of scope here. It talks to the bridge, Supabase and the
  That Open platform it runs on.
