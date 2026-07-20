# Pilot Demo Runbook — the Governed Publish loop (BDS)

**Goal:** run the *one differentiated seam* — desktop → cloud → **referee** — as one flawless, first-try demo.
**Thesis it proves:** *"A model becomes TRUE here, and it's on the record."* No competitor (ACC, Revizto,
Solibri) owns the seat where an authored model is adjudicated by IDS, governed by ISO 19650, and recorded
immutably.

Design spec: `docs/superpowers/specs/2026-07-20-governed-publish-loop-pilot-design.md`.
Fixtures: `demo/bds-pilot/` (see its README). This runbook is **G4** of that spec.

---

## 0. The four beats (this is the acceptance criteria)

Two screens: a **modeler** (Revit) and a **coordinator** (browser, zero install).

1. **Modeler** clicks **Governed Publish** on the Sentinel ribbon → one action: export active view → IFC →
   **IFC Delivery Gate** → **IDS adjudicate** → record verdict to the **immutable audit chain** → upload +
   version **only on pass**. Result dialog: **✓ ACCEPTED — published as v4** or **✗ REJECTED — N failures
   (not published)**, with reasons.
2. **Coordinator** opens the project's **Files / CDE** tab → the new version is there with who/when, its ISO
   19650 state, and a **✓/✗ verdict badge**; clicking the badge opens the hash-chained audit entry behind it.
3. **On a REJECT** the failures have **auto-opened as BCF issues** (one per failing requirement), visible on
   the 3D elements in the web Issues panel and **live-synced into the modeler's Revit**.
4. **Modeler fixes, re-publishes** → **✓ ACCEPTED**; re-publish doesn't duplicate issues; the audit shows the
   full trail *rejected → fixed → accepted* with names and timestamps.

If those four land cleanly, the demo is done. Everything else is out of scope.

---

## 1. Preflight checklist (T-15 min)

Run top-to-bottom. Do **not** start the demo with any ✗.

### 1a. Bridge up and healthy
```bash
cd WebApp
npm run bcf:serve      # listens on http://127.0.0.1:4100 (override BCF_PORT)
```
Watch the startup banner — you want all of these:
```
Sentinel BCF-API 3.0 listening on http://127.0.0.1:4100
[bridge] bind: 127.0.0.1 · auth token: off
[bridge] JWT-forwarding: armed (forwards a caller's Supabase JWT → RLS)
[bridge] platform token: valid ✓ (project <id>)          ← uploads + Open-3D need this
[bridge] cross-machine event feed: on                    ← live BCF sync
```
- ⚠ `platform token REJECTED …` → regenerate `THATOPEN_API_KEY` (dashboard → Data → API Tokens) in
  `config/.env`, restart. Uploads and Open-3D fail without it; BCF/CDE still work.
- `JWT-forwarding: off` is acceptable for a single-operator demo (service key). Arm it (`SUPABASE_ANON_KEY`
  in `config/.env`) only if you're demoing multi-user RLS.

### 1b. Health endpoint green
```bash
curl -s http://127.0.0.1:4100/health
# { "ok": true, "cde_configured": true, "cors": "allowlist", ... }
```
`cde_configured: true` is **required** — the whole loop writes to Supabase. If false: set `SUPABASE_URL` +
`SUPABASE_SERVICE_KEY` in `WebApp/config/.env`, restart.

### 1c. Demo dataset in place
- `demo/bds-pilot/ids.json`, `elements-draft.json`, `elements-fixed.json` — present (repo).
- `demo/bds-pilot/delivery-contract.json` — copied to `%AppData%\Sentinel\delivery-contract.json` (the
  IFC Delivery Gate reads it there).
- `demo/bds-pilot/ids.json` — copied to `%AppData%\Sentinel\ids.json` (the Revit **Governed Publish**
  command adjudicates against it; absent ⇒ the model is recorded but not judged — a gate-only publish).
- The BDS demo model open in Revit (or rely on the headless dry-run in §2 if Revit isn't on the demo box).

### 1d. Web app open on the project
- Open the WebApp on the platform (or `npm run dev`), select the **`bds-pilot`** project, and land on the
  **Files** and **Issues** tabs so the coordinator screen is pre-warmed.

### 1e. Dry-run once (below) on a *throwaway* key, then reset (§4). Never rehearse on `demo` — its audit
chain is immutable and rehearsal rows can't be deleted.

---

## 2. Headless dry-run (no Revit) — proves the referee half today

This exercises **G2 (fail→BCF)** and **G3 (verdict badge)** end-to-end against the live bridge, using a
throwaway project key so nothing pollutes real data. It is also the fallback demo if the Revit box is down.

```bash
cd WebApp
BASE=http://127.0.0.1:4100
KEY=bds-pilot-rehearsal            # throwaway; a fresh key auto-creates the project

# 1) Register a file version to badge (captures the real version id)
VID=$(curl -s -X POST $BASE/cde/$KEY/files \
  -H "Content-Type: application/json" \
  -d '{"name":"ARC-BDS-ZZ-XX-M3-A-0001.ifc","author":"BDS Modeler","revision":"v1"}' \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).version.id))')
echo "version_id = $VID"

# 2) Propose the DRAFT against the IDS, tied to that version → REJECTED + BCF issues raised
#    (the elements-*.json files ARE the elements array — cat them straight in)
curl -s -X POST $BASE/cde/$KEY/propose -H "Content-Type: application/json" \
  -d "{\"source\":\"Governed Publish\",\"actor\":\"BDS Modeler\",\"version_id\":\"$VID\",\"ids\":$(cat ../demo/bds-pilot/ids.json),\"elements\":$(cat ../demo/bds-pilot/elements-draft.json)}" \
  | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log("verdict:",r.verdict,"| bcf raised:",r.bcf?.raised,"skipped:",r.bcf?.skipped)'
# → verdict: rejected | bcf raised: 4 skipped: 0

# 3) Coordinator view: the issues are live, and the version now carries a ✗ badge
curl -s "$BASE/bcf/3.0/projects/$KEY/topics?status=all&model=" | node -e 'const t=JSON.parse(require("fs").readFileSync(0));console.log(t.length,"BCF topics:",t.map(x=>x.title))'
curl -s "$BASE/cde/$KEY/audit" | node -e 'const a=JSON.parse(require("fs").readFileSync(0));console.log("verdict events:",a.filter(e=>e.action.startsWith("verdict:")).map(e=>e.action))'

# 4) Fix and re-propose → ACCEPTED; re-run also proves BCF dedup (raised 0 on the same reqs)
curl -s -X POST $BASE/cde/$KEY/propose -H "Content-Type: application/json" \
  -d "{\"source\":\"Governed Publish\",\"actor\":\"BDS Modeler\",\"version_id\":\"$VID\",\"ids\":$(cat ../demo/bds-pilot/ids.json),\"elements\":$(cat ../demo/bds-pilot/elements-fixed.json)}" \
  | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log("verdict:",r.verdict)'
# → verdict: accepted
```

In the browser, open the **Files** tab on `bds-pilot-rehearsal`: the version row shows the badge (**✗ rejected**
then **✓ accepted** on the fixed run — the badge reflects the latest verdict); the **Issues** tab shows the 4
BCF topics with the failing elements selected. That is beats 2–4, no Revit required.

> Pure adjudicator sanity check (no DB writes): see `demo/bds-pilot/README.md` §"Verify".

---

## 3. Live demo script (with Revit — the real beat 1)

1. **Modeler (Revit):** Sentinel tab → **Workflow** panel → **Governed Publish**. Pick the BDS view.
   - The command runs export → `IfcDeliveryGate.Validate` → `adjudicate` (via `POST /cde/:key/propose`) →
     records the verdict → publishes+versions **only on pass**; on fail it also opens the BCF issues (G2).
   - First run uses the **draft** model → dialog shows **✗ REJECTED** with the failing requirements.
2. **Coordinator (browser):** Files tab → new version with **✗ rejected** badge → click the badge → immutable
   audit entry. Issues tab → 4 BCF issues on the elements.
3. **Modeler:** the same issues appear in Revit (BcfSyncManager / SSE). Fix the 4 items.
4. **Modeler:** **Governed Publish** again → **✓ ACCEPTED — published as v2**. Coordinator refreshes → badge
   flips to **✓ accepted**, no duplicate issues, audit trail reads *rejected → fixed → accepted*.

> The single **Governed Publish** ribbon command (**G1**) is built and compile-verified for Revit 2025/2026;
> it needs a live Revit run to verify end-to-end (only the user can do that). It loads the IDS from
> `%AppData%\Sentinel\ids.json` and adjudicates the live model's exportable elements (walls' `IsExternal`,
> doors' `FireRating`, every element's `Name` — the demo checks) — so the demo model must carry those params.
> If it misbehaves in Revit, fall back to the three standalone commands (**Quality → IFC Delivery Gate**, then
> **Workflow → Publish to Platform**, adjudication from the web IDS panel) or the headless dry-run (§2), which
> proves beats 2–4 without Revit.

---

## 4. Reset between rehearsals

- **Throwaway keys only** for rehearsal (`bds-pilot-rehearsal`, `_g2test`, …). The audit chain is immutable by
  design — you cannot scrub verdict/issue rows from a project once written, so never rehearse on `demo`,
  `default`, or any real project.
- To retire a rehearsal project, delete it from the DB **only if it has no audit rows you need to keep** (a
  project protected by the global hash-chain will refuse audit-row deletion — that's the immutability feature,
  not a bug). Simplest: use a **fresh key** each rehearsal and leave the old ones.
- BCF topics for a rehearsal key are isolated by `project_id`; they don't appear under real projects.

---

## 5. Gotchas seen in prep

- **CORS / CSRF 403 on POST from the browser:** the bridge only accepts state-changing requests from an
  allowlisted Origin (default `platform.thatopen.com` + localhost). Serve the web app from an allowlisted
  origin, or set `BCF_CORS_ORIGIN`. Revit/curl send no Origin and are unaffected.
- **`503 CDE not configured`:** `SUPABASE_SERVICE_KEY`/`SUPABASE_URL` missing — the loop needs Supabase.
- **Badge doesn't appear:** the verdict badge only lights up when the propose carried a `version_id` (the
  Governed Publish / dry-run path). An agent proposal with no version is recorded but not badged, by design.
- **Issues didn't sync to Revit:** confirm the startup banner shows the event feed on; a single-machine demo
  uses local SSE (instant), cross-machine is ≤ `BCF_EVENT_POLL_MS` (default 3 s).
- **Raw `.ids` XML → 400:** the server adjudicator takes a **JSON** IdsSpec (`demo/bds-pilot/ids.json`); raw
  `.ids` XML is parsed browser-side only.
```
