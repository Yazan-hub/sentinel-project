# Human-error guards: risk-tiered review, version checks, governed delete-duplicate (2026-10-21)

The last three human-error guards of the 2026-10-19 evaluation: §4A2 (reviewer fatigue), §4B3 (races on governed rows) and the §5
UI guardrails (risk-tiered review, batch limits with friction, default-deny deletes). Designed and built without design questions
on the founder's "do them all urself"; only the live migration needs his OK.

## 1. Risk-tiered review (Review AI Proposals, Revit)

**Tiers.** `ReviewRisk.Tier(el, near)` (Revit-free, promote-check links it) gives each row one of three:

| Tier | Rows | Window |
|---|---|---|
| `safe` | set_parameter on a type that reaches no protected element; retype; attach; creates of door, window, furniture, room, ceiling — none near a protected element | grouped as today (Tick group, Untick group, the group's decline reason) |
| `reason` | reshape, rehost, delete, a create that replaces; creates of wall, floor, roof, column, beam, stair, terrain, level, grid, mass, opening; any row near a protected element | one group "Needs a reason", no Tick group: each row is ticked by hand; never pre-ticked; one box "Why you apply the rows ticked here" — required when any is ticked |
| `protected` | a non-create row whose own element is protected (ProtectionWhy) | unticked and locked, with the policy's words — the executor would keep it as it stands anyway |

**Near.** Read by the command on Revit's thread when the window opens (as `reach` and `notLoaded` are):
- a row's own element, or a create's planned outline (its curve, loop, boundary or point, from its level to 3 m above), whose box comes
  within 50 mm of an element the protection policy protects (`ChangesetExecutor.ProtectionWhy`);
- a set_parameter whose type has at least one protected instance (it reaches it).

**Batch limit.** More than 200 rows ticked across the window's batch (a storey batch can be several changesets): Apply asks, in words,
to untick some and apply in parts, or to give a batch reason (a box that shows only over the limit). §4A3's 200.

**Recorded.** The result carries `tick_reasons` `{proposal_guid: reason}` for every ticked `reason`-tier row and `batch_reason`; the
bridge validates both (one line, ≤ 500; keys are applied rows) and puts them on the result and the `changeset_applied` row. The bridge
never refuses a result after Revit applied it: a row it judges risky by its op or kind (reshape, rehost, delete, replaces, the geometry
creates — it cannot see "near") that arrives with no reason is listed as `unreasoned` on the row (an older add-in).

Unchanged: the apply claim and attempt key, the protection hold in the executor, Revert, web declines, the group decline reasons.

## 2. Version checks on governed rows (optimistic concurrency)

**Standards (every artefact kind — review template, protection, guideline, IFC mapping, naming, contract, LOD, AI policy…).** The
pointer is already versioned (`kind@n`, create-only), so no migration: `PUT /cde/:key/artefacts/:kind` takes `If-Match: "<sha256>"`
(the sha of the artefact in force for `key`, as read) or `"none"` (nothing was in force). The bridge resolves the artefact in force
now; a different one is a **412** — `"protection was changed by <installed_by> at <HH:MM UTC> — reload; nothing was saved"`. Two
installs at once still meet the create-only `kind@n+1` (409, as before).

**Projects (settings and metadata).** Migration **0048** adds `version bigint not null default 1`, `updated_at timestamptz` and
`updated_by text` to `projects`, and a BEFORE UPDATE trigger: `version = old.version + 1`, `updated_at = now()`, `updated_by` = the JWT's
email when a signed-in session writes, else the writer's own `updated_by` (the bridge's actor, machine credential), else
`the Sentinel bridge`. Both writes (`PATCH /cde/projects/:key` → updateProject, `PUT /projects/:key` → patchProjectMeta) take
`If-Match: "<version>"`: the PATCH is filtered on `version=eq.<n>`; no row back and a version that moved is a 412 in the same words;
no row back otherwise stays the existing 403. Reads (`GET /cde/projects`, `GET /projects/:key`) carry `version`, `updated_by`,
`updated_at`.

**Optional on the wire.** A write with no If-Match is written as today (scripts, the MCP server, an older add-in). The clients that edit
a form send it: the web standard forms and Project Settings; Revit's Protection, Modelling Guideline and IFC Export Mapping windows.
PC Settings writes only this PC's files (bcf-config.json, config.json) — nothing to send.

**Review chains.** The template is the `review@n` artefact (covered above); a decision goes through `review_decide` in one database
transaction (one approval per step) — already race-safe.

Not in this batch: task teams, deliverables, RFIs, BIM document sections, member roles — no client sends a token for them yet.

## 3. Governed "delete duplicate" changeset op

**Filing.** `op: "delete"` for kinds wall, floor, roof, ceiling, door, window, column, beam, furniture. `target.ifc_guid` (the copy)
and `target.keeper_ifc_guid` (the element that stays) — the web knows IFC GlobalIds, not Revit UniqueIds. The bridge files one only:
- from a signed-in **lead** or owner (never the machine credential, the MCP server or an agent — §5 default-deny deletes from AI);
- with `source: "clash"`;
- when the project's clash register holds a hit of a `duplicate|…` group naming exactly these two GlobalIds, in one model.
It is never pre-ticked. The web clash panel files it: a same-model duplicate group gets **Propose deleting the copies…** (a lead's),
the copy being the higher local id of each pair; cross-model duplicates stay Issues and the panel says why.

**Apply (Revit).** Both GlobalIds are found in the open model (`BcfApplyEvent.MapByIfcGuid`). The row is kept as it stands, with why,
unless all hold: same category, same type, same level; location (a curve's two ends either way, or a point) within 5 mm; bounding boxes
within 5 mm; the copy not held (HeldBy) and not protected (a protected element is never deleted, no override); a probe delete (rolled
back) takes only the copy and its tags. Before the delete the copy's writable instance values (string, integer, double, element id) and
the keeper's UniqueId are read; the applied row carries them as `before` (`keeper_unique_id`, `values`).

**Revert.** Copies the keeper in place (`ElementTransformUtils.CopyElement`, zero move), writes the stored values back and stamps it
reverted. Said: "re-created as a copy of the element kept — same type, place and values; its Revit id and IFC GlobalId are new".
Refused in words when the keeper is gone, no longer the same type or place, held, or the copy takes more than one element.

## Tests and drill

- vitest: the bridge's If-Match on artefacts and projects (fake PostgREST + PGlite), tick_reasons/batch_reason/unreasoned, the delete
  filing rules and the register proof, the web forms' headers, the clash panel's delete proposal.
- promote-check: ReviewRisk tiers and the batch limit; RevertPlan's words for a delete.
- PGlite: 0048 dry-run + probe (`probes/0048_probe.sql`).
- Live drill (Revit 2024, scratch copy bound to ma4c-drill): tiers in the window, a reason refused then taken, the ledger row; a stale
  standards save in Revit and on the web; a duplicate wall deleted with a reason and reverted. Recorded in
  docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md.
