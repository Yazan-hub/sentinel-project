# P1-05 Master information delivery plan, MIDP (clause 5.4.5)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real appointment.

**What 5.4.5 asks (reference file, Part 2 p.53).** The lead collates all the TIDPs into one plan. ISO 19650-2 gives no minimum contents; the TIDP contents plus the task team per container are a starting point. The MIDP is kept current as TIDPs change and teams join. CDBB BEP 2.6 (p.9) suggests, per deliverable: container identification, description, level of definition, level of information, dependant, classifications, date of issue. Sentinel's paste format holds only part of that (see the columns below).

## How to load it

Deliverables panel, "Paste a delivery schedule". Paste the whole content of `P1-05_MIDP_rows.txt` (21 lines, no header line, real TAB characters between columns). Press Preview, then "Import 21 row(s)". Import is all-or-nothing: one bad row rejects the whole paste. Declare the five teams first (P1-03) so the team column matches.

## Columns (exact order, from the parser)

Source: `WebApp/src/setups/deliverables-panel.ts` lines 397 and 406 (the help text and the split), checked against `WebApp/bridge/deliverables-store.mjs` `validateRow` lines 15-41. The line is split on a TAB or a comma, so **no value may contain a comma**.

| # | Column | Rule |
|---|---|---|
| 1 | container name | required; matches what arrives in the CDE |
| 2 | title | free text |
| 3 | team | free text, matched to a declared team code case-insensitively (ARC, STR, MEP, SIT) |
| 4 | due date | YYYY-MM-DD, a real date |
| 5 | stage | one of tender, design, coord, constr, hand, oper (anything else, such as "DD", is refused at Import; Preview accepts it, finding F-SNW-2) |
| 6 | expected revision | optional free text |
| 7 | expected suitability | optional free text |

The paste has no column for "purpose". A row with no purpose is reported by `midp.plan_completeness`; add the purpose on each row's form afterwards, or record it as a finding (not verified whether the check will fail the plan).

## What the rows say

- 7 containers by 3 milestones = 21 rows. The same container name repeats once per milestone; the database does not require it to be unique (migration 0022, comment line 8).
- INT has no row: it works inside SNW_ARC_ZZ_XX_M3_A_0001 (decision 10).
- **Container names** are those of P1-03 part (c): SNW_ARC_ZZ_XX_M3_A_0001 (Architectural), SNW_ARC_ZZ_XX_M3_A_0002 (Facades), SNW_STR_ZZ_XX_M3_S_0001, SNW_MEP_ZZ_XX_M3_M_0001 (HVAC), SNW_MEP_ZZ_XX_M3_P_0001 (Plumbing), SNW_MEP_ZZ_XX_M3_E_0001 (Electrical), SNW_SIT_ZZ_XX_M3_L_0001.
- **Dates:** M1 2026-12-04, M2 2027-01-15, M3 2027-02-26.
- **Stage mapping (roadmap section 5):** M1 and M2 are "design"; M3 is "coord". Milestone names are labels, not Sentinel stages.
- **Expected revision:** v1 at M1, v2 at M2, v3 at M3. Revit Governed Publish numbers versions v1, v2, v3.
- **Expected suitability:** S2 on every row (shared for information, UK 2021 National Annex). Governed Publish registers S0 and sends no revision, so `midp.suitability` is expected to disagree with S2. That is a recorded finding, not a data error (roadmap P1).
- The title holds the model name and the milestone label, so the milestone is visible in the list.

## Rows expected to stay pending

A row leaves "pending" when its container arrives. These are expected to stay pending, which is evidence for the roadmap findings (F-SNW-16: all rows stayed pending after the ARC publish in the earlier run).

| Rows | Count | Why |
|---|---|---|
| HVAC, Plumbing, Electrical at M1, M2, M3 | 9 | Refused by the one delivery contract (decision 6; P0-05 R06). HVAC refused in Snowdon; Plumbing and Electrical not run, expected the same |
| Facades at M2 and M3; Site at M2 and M3 | 4 | Roadmap call: for design and coordination only ARC and STR are re-published, plus any model whose refusal was cleared |
| Facades at M1 and Site at M1 | 2 | Not run in Snowdon (B27 for FAC and SITE not run); may be delivered or refused. Unknown |

Rows expected to be delivered: Architectural M1, M2, M3 and Structural M1, M2, M3 (6 rows). Expected result when everything runs as planned: 6 delivered, 13 pending, 2 unknown. If the second MEP or Facades test passes, record it.
