# Clash triage — design (2026-10-20)

Source: `docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md` §3.6 item 7, §5 "Clash triage", and the founder's
Q5 answer: the whole loop stays in Sentinel (check → propose fix → approve → record); Sentinel does not race Navisworks on
detection. Triage sits on top of the existing exact clash (Collider, Federation Gate lock, bridge-only register since 0034).

## What the coordinator gets

Coordination ▸ Clash gains a third view, **Groups**, beside New and Register.

1. **Grouping.** Every hit of the last run is read once more for each element's category, name and storey
   (`ContainedInStructure`). A group is `kind × pair × level × owner discipline`:
   - *pair* — plain names, sorted (`Beam × Duct`), never an IFC code alone (`plainCategory`).
   - *level* — the storey of the owner's element, else the other element's, else "No level".
   - *owner discipline* — from the model's ISO 19650 file name (role field, `A` Architecture, `S` Structure, `M`
     Mechanical …); a model without an ISO name falls back to the element type (beam/column → Structure, duct/pipe/tray →
     Services, else Architecture). The side that **yields** owns the group: Structure never moves (rank 3) over
     Architecture-like (2) over Services (1). A tie between two different disciplines takes the alphabetically first
     (ponytail: a size rule — duct over pipe over tray — when coordinators ask).
   - Groups sort by kind (clash, duplicate, touching) then by count.
2. **Assignment.** *Discipline owners* — one member per discipline, set once per project (lead), kept by the bridge
   (`bridge_docs` store `clash_triage`, doc `owners`; ledgered). Each group shows its discipline's owner and can be
   changed for that group before raising. **⚑ Raise group** creates **one** BCF topic per group: assigned to the owner,
   every element GUID in its viewpoint selection, the hits listed in the description. Every hit is recorded on the
   register with `bcf_guid` = the group topic and `group` = the group key. The Federation Gate lock applies unchanged.
3. **Trivial classes.**
   - **Duplicate** — same plain category and both boxes equal within 10 mm. Changesets cannot delete (OPS has no delete)
     and Revert could not undo one, so the group is **routed to its owner**: the group topic says which copy to remove
     (the yielding discipline's, never the structural copy) and that a person removes it in Revit. A real delete op is a
     separate decision (founder).
   - **Touching** — the solids meet with no overlap volume (`touching`, or volume ≤ 1e-9 m³). **Mark not a clash**
     records the hits on the register with status `not_a_clash` and a reason ("touching faces, no overlap volume"); one
     ledger row each ("Clash marked not a clash: … — reason"). The lock applies (it is a register record).
   - Nothing is moved; no structural element is ever proposed for change.
4. **Import door (optional).** **＋ Imported BCF** reads the project's open Clash topics that no register record links
   to (Navisworks/ACC clashes that arrived as BCF), resolves the first two GUIDs of each viewpoint in the loaded models,
   and adds them to the same groups. Raising such a group records them like any other hit.

## Bridge

- `CLASH_STATUSES` gains `not_a_clash`. A new record may carry `status: "not_a_clash"` with a `reason` (1–300 chars) —
  every other new record is still "raised"; a PUT to `not_a_clash` needs a reason too. Records keep `group` and `reason`.
- `GET /clash/:pid/owners` → `{ disciplines: { [discipline]: email } }`; `PUT` (lead) replaces it, one ledger row.
- No migration: every `bridge_docs` store is bridge-only since 0038 (`bridge_docs_floor` → null).

## Tests

- `src/sentinel-core/clash-triage.test.ts` — names, discipline, yield, duplicate/touching, grouping.
- `bridge/write-roles.test.mjs` (Clash register block) — not_a_clash needs a reason, record keeps reason + group, ledger
  row; owners: lead-only PUT, member GET, ledgered, service-key write.

## Drill (CT)

On a drill project with two models (aster-tower, B18's set): run → Groups shows plain-named groups with counts and
owners; set a discipline owner; raise one group → one topic, assigned, N register rows with the group; mark a touching
group not a clash → register + ledger rows with the reason; ＋ Imported BCF with one hand-made Clash topic.
