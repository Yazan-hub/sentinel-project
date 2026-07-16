# Overnight work report — 2026-07-16

Autonomous session while you slept. Everything below is committed. I stuck to work I could **verify**
(builds, DB logic, endpoint routing) and avoided irreversible outward-facing actions. **Two things need
you** this morning — they're in §4.

---

## 1. Headline: the CDE is real and running

Built and **verified on your Supabase** (`autqqtwhxqrfjaztablm`) the ISO 19650 governance core that the
market research said **no OpenBIM competitor ships web-native**:

- **C1 — schema** (`6c75109`): projects · parties · memberships · information_containers · container_versions
  (state + suitability + revision) · transmittals · **append-only audit_log**. RLS on, locked to the server key.
- **C2 — state machine + immutability + tamper-evidence** (`7876976`): `cde_transition()` enforces
  WIP→Shared→Published→Archived (+reject-to-WIP); **published versions are immutable**; the **audit log is
  append-only and hash-chained**. *Proven:* valid lifecycle with intact hash chain; illegal skip,
  published-edit, and audit-tamper all rejected by the DB.
- **C3 — endpoints + UI** (`0ac88cf`): bridge `/cde/...` routes (Supabase-backed, service-key only) and a new
  **CDE tab** — a WIP→Shared→Published→Archived board with suitability codes, one-click transitions, a
  new-container form, and a live append-only audit strip.
- **Clean demo seed**: the `demo` project has one container in **each** state so the board shows the full
  lifecycle immediately.

Migrations are version-controlled at `WebApp/db/migrations/0001_*.sql` and `0002_*.sql`.

## 2. Also shipped

- **Modeling bug fixed** (`4e48067`) — authored walls/columns/slabs were invisible under the deferred "pen"
  renderer (unlit material on a dark background); switched to an unlit `MeshBasicMaterial`. **Needs your
  eyes to confirm** (see §4).
- **4D × 5D × 6D fusion** (`a719540`) — the existing 4D timeline now accrues **cost and embodied carbon of
  everything built-to-date** as you scrub ("▲ $X of $Total (NN%) · Y tCO₂e built to date"). This is the
  integrated-dimensions story the research flagged as **owned by no incumbent**.
- **Two cited market-research reports** — `docs/4d-market-analysis.md` (Synchro/Navisworks/gaps) and
  `docs/cde-market-analysis.md` (CDE landscape + Sentinel gap analysis + universal-connectivity strategy).
- **Master roadmap** — `docs/cde-platform-spec.md` sequences all four threads (CDE / 4D / Revit-UI /
  connectors) with the CDE as the backbone.

## 3. Verification status (honest)

| Item | Verified | How |
|---|---|---|
| CDE C1 schema | ✅ | applied + end-to-end insert on Supabase |
| CDE C2 state machine / immutability / hash chain | ✅ | valid flow + 3 rejection tests on Supabase |
| CDE C3 bridge routing + 503 path + BCF regression | ✅ | live curl on a spare port |
| CDE C3 **live** end-to-end (bridge↔Supabase) | ⏳ | **blocked on your service key** (§4) |
| 4D fusion + CDE panel + all frontend | ✅ build | `vite build` clean (126 modules) |
| Modeling visibility fix | ⏳ | **needs your browser test** (§4) |
| Data-layer (BCF/RFI/tender) | ✅ | 11/11 automated checks earlier |

I can't drive the WebGL canvas or your live browser, so anything interactive (the CDE board rendering, the
modeling boxes, the 4D playback) is **build-verified but needs a human click** — that's the honest limit.

## 4. ⚠️ Two things only you can do

**(a) Unlock the CDE — add your Supabase service key** (a secret; I don't handle secrets). In
`WebApp/config/.env` (or repo-root `config/.env`) add:

```
SUPABASE_URL=https://autqqtwhxqrfjaztablm.supabase.co
SUPABASE_SERVICE_KEY=<Supabase dashboard → Project Settings → API → "service_role" secret>
```

Then **restart the data service** (`./start.ps1` in `WebApp`, or `npm run bcf:serve`) — the currently-running
instance predates the `/cde` routes. Reload the app → **CDE tab** → you should see the WIP/Shared/Published/
Archived board with the demo containers, and transitions should work (the DB rejects illegal ones).

**(b) Confirm the modeling fix** — reload → **Model** tab → click **Column** → drop one in the viewport. If a
box now shows, the fix landed. If it's still only gizmo arrows, tell me and I'll register the materials into
the postproduction pass.

## 5. Where the roadmap stands

Done: **C1, C2, C3** (CDE core + UI) · 4D×5D×6D fusion · modeling fix.
Next in sequence (need your key first for the CDE ones): **C4** auth + RLS policies · migrate BCF/RFI/tender
JSON → Postgres · **D2** self-healing schedule↔element linking · **R1** Revit-style UI · **X1** OpenCDE +
handover bundle.

## 6. Commits this session
`a719540` 4D×5D×6D fusion · `0ac88cf` CDE C3 · `7876976` CDE C2 · `6c75109` CDE C1 · `3df766b` roadmap ·
`1de125b` CDE research · `a1b1a47` 4D research · `4e48067` modeling fix · `376c0d6` Bake&Upload ·
`1c85d9a` Bake IFC (B) · `2757d54`/`835f478` IFC-authoring spike+scope · `bc451d5` 3D modeling studio ·
plus the earlier Standards/copilot/bridge features.

**Both dev servers were left running** (:4000 app, :4100 data) so you can test immediately.
Tell me the modeling result and add the key, and I'll pick the sequence back up.
