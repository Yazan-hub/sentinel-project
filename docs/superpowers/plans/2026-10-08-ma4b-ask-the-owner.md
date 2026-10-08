# MA-4b — Ask the owner: the request letter and drawings admitted under it

**Goal:** a lead drafts a document request to the owner, the architect or the municipality (Sentinel drafts it and sends
nothing — the person sends it themselves); the drawings that come back are admitted to the project's evidence pack under that
request, after a lead signs (a) and (b). Design: `docs/strategy/2026-09-30-model-automation-design.md` §4.1 (:395), §6.2 (`request_id`),
§6.6 (`evidence:requested`), §6.8 (the route). Builds on MA-4a (`bridge/evidence-logic.mjs`, `bridge/evidence-store.mjs`, `src/setups/evidence.ts`).

## Decisions

- **Route:** `POST /cde/:key/evidence/:pack/requests` (spec amendment S3: per pack, as every other evidence route — the requests live in
  the pack; the design's `/evidence/requests` named no pack). Body `{recipient_kind, recipient?, documents[], purpose?}`.
- **Who:** a signed-in lead or owner of an office project (the letter speaks for the project); the machine credential is a 403 in words
  (a request names who asks). Budget "evidence requests" `{perUser: 10, all: 30}`.
- **Stored in the pack:** `requests: [{id: "req-NNNN", recipient_kind, recipient, documents, purpose, letter, letter_sha256, drafted_by,
  drafted_at}]` — at most 50; the letter text is kept (it is what was asked, and the web shows it again to copy). `requests` is optional
  on a pack (MA-4a packs have none); a new pack carries `[]`.
- **Ledger:** one `evidence:requested req-NNNN <recipient_kind>` row (entity type `evidence`): `{pack_id, request_id, recipient_kind,
  documents: n, letter_sha256, actor}` — the recipient's name is not put on the append-only ledger.
- **The letter:** a pure function of the pack's asset name, the project key, the request and the drafter; English; ends "[your name and
  title]" for the person to sign. It asks for copies and for written permission for these uses only (view as reference, extract
  geometry; never published, passed on or used to train software; kept in the office with a sha256 each).
- **Drawings:** `kind: "drawing"`, formats pdf (`%PDF` 25504446), dwg (`AC10` 41433130), dxf (by extension), png, jpg (their magic);
  not surveyable. A new drawing names `request_id` (a request of this pack, else 404 in words); the bridge stamps `provider` = the
  request's `recipient_kind`, `licence: "holder-permission"`, `request_id`; `ADMIT_NEEDS.drawing = ["a", "b"]`. No registration in 4b.
  A body's provider is not read for a drawing except the RED check. A flagged drawing comes back as first admitted (its request kept).
- **Web:** Files ▸ Evidence ▸ "Ask the owner": the requests (each with its letter in a read-only box and Copy), and for a lead a form
  (to: owner | architect | municipality, name optional, documents one per line, purpose optional) → `✓ Drafted req-0001 — Sentinel sends
  nothing: copy the letter and send it yourself · ledger #n`. A pdf/dwg/dxf in the folder is admitted as a drawing with a request picked;
  an image can be admitted "as drawing" when the pack has a request.

## Rows

| # | Row | Where |
|---|---|---|
| 1 | `readRequestBody`, `letterText`, `newRequest`, `requestedValue`; drawing formats, `formatOf(p, kind)`, `magicRefusal(f, head, kind)`, `ADMIT_NEEDS.drawing`; `newItem` for a drawing; `validatePack` for `requests` and drawing items | `bridge/evidence-logic.mjs` (+ test) |
| 2 | `draftRequest`; drawings in `admitRun` | `bridge/evidence-store.mjs` (+ test) |
| 3 | the route | `bridge/bcf-service.mjs` |
| 4 | types, `kindOf` (drawing), `requestLine`, `draftRequest`, `evidenceControls.ask`, `itemLine` for drawings | `src/setups/evidence.ts` (+ test) |
| 5 | Ask the owner and drawing admission | `src/setups/files-panel.ts` |
| 6 | design rows and S3, the drill | `docs/strategy/2026-09-30-model-automation-design.md`, `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` |

## Drill MA4b (after the build)

On 4101 (the branch), project `ma4a-drill`. Machine rows: `POST …/requests` by the machine credential → 403 in words; a drawing admit by the
machine credential → 403. Person rows (a signed-in lead, the local app): draft a request to the owner → the letter shown, one
`evidence:requested` row; put `drawings/A-101.pdf` in the folder; admit before (b) → `a lead must sign (b) first`; sign (b); admit it
under req-0001 → `provider: "owner"`, `request_id: "req-0001"`, `licence: "holder-permission"`; a `.pdf` that is not a PDF → refused in words.
