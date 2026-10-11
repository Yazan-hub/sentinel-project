# MA-5a-2: Survey Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make what a scan proposes, and what a scan's verdict says, earn the trust a person gives it — doors only when seen through the wall, no pre-ticked scan walls, a thickness only when the faces are clear of their scatter, and a deviation verdict that can tell a wall in place from one off it.

**Architecture:** Three small reads in `sentinel-survey` (0.6.0: per-face deviation numbers, `faces_seen` = distinct faces, a scan-only thickness gate), the bridge's planner and judge (`survey-plan.mjs`: the door rule, no wall pre-tick, the untrusted-thickness words, the per-face verdict at 25 mm), the store's verify row and contract (`changesets-store.mjs`, `build-jobs.mjs`), and the web's words (`evidence.ts`, `review-desk.ts`). No add-in change: Revit opens a scan create ticked only when the bridge stored `pretick: true` (`ChangesetClient.cs:228`); `tools/promote-check` pins the shared fixture.

**Tech Stack:** Python 3.14 + numpy (survey, `unittest`), Node ESM bridge (vitest), TypeScript web (vitest), C# promote-check (dotnet).

**Spec:** the founder's "go" (2026-10-11) on the recommendations measured that day — evidence in this plan's §0 (from the scratchpad brief `ma4h3/brief5b.md` and the skeptic workflow `wf_fe5f9019-dd5`, whose three reviews revised every draft).

## Global Constraints

- `sentinel-survey` VERSION `"0.6.0"`; a job read by 0.5.0 is proposed as before; a measure of one fails in words (the store's existing version rule, `changesets-store.mjs:432`).
- Doors: proposed only when `fit.faces_seen >= 2`. Windows: no faces filter.
- `faces_seen` counts **distinct faces** whose holes formed the opening (never 2 from one face).
- Thickness gate: a pair's `thickness_mm` is kept only when the faces' gap ≥ `THICK_SCATTER` (10) × the pair's fit rmse; otherwise the wall carries `faces_apart_mm` instead (its faces and centreline unchanged).
- Pre-tick: a scan's **walls** are never pre-ticked (bar: ≥ 0.8 of a scan's paired walls are traced walls on a reference; Kladno 0.5.0: 46 of 77 = 0.60). A created level keeps its pre-tick (its height is checked). Doors and windows stay unticked (decision 10).
- Deviation verdict: per face, at `DEVIATION_MM` = 25; a face with an interior passes when ≥ `FACE_SHARE_MIN` of its points lie within 25 mm; every judged face must pass; a face with an interior and no point within the band is out. `FACE_SHARE_MIN` is set by T-1 (rule in Task 0).
- `TOLERANCES_MM = [25, 50, 100, 200]` (the band stays 2 × 200 = 400). `TOLERANCE_MM` (20) keeps the level match and the fit status.
- Words never claim the scan resolves 50 mm: "this check cannot see a 20 mm offset, nor a thin partition moved by its own thickness".
- Fixtures use example.test only. No add-in deploy. Web version 1.0.73.

## Review Focus

1. **A wall placed correctly whose one face is cluttered** (a cupboard against it) → its verdict may read out; the reason must name the face and its share, never a bare "out". Test in Task 4 (reason words per face).
2. **A job read by 0.5.0 proposed after this merge** (its `faces_seen` from the old merge) → the door rule still applies to its numbers; nothing breaks. Test in Task 3 (a door with `faces_seen` 2 is proposed, 1 is not).
3. **An old verify row (p95, `target_mm` 20) shown on the desk after the change** → the desk keeps its old words for it. Test in Task 5.
4. **A wall whose thickness is withheld that hosts a door or window** → the opening is held with words naming the untrusted thickness, never "seen on one face only". Test in Task 3.
5. **A measure result without per-face numbers** (a stale service) → refused in words by the contract check, nothing kept. Test in Task 4.

---

## §0 Evidence (Kladno, master 0.5.0, in memory = the live job-0004)

- **Doors only** (windows dropped from candidates and reference) @100: any 17 TP / 55 FP / 7 FN (F1 0.354); both faces 13 / 15 / 11 (0.500); 1F 0.467 → 0.686; GF 3 → 1 TP of 7 traced (no better than chance on GF). Doors on two-face walls: 50 (16 real) → 28 (13 real); on one-face walls 22 (1 real, held anyway). The 3 real doors lost are in 338–509 mm walls (a closed leaf near one face).
- **Windows:** 10 of 11 1F window holes sit on five paired façade walls at a ~2 850 mm rhythm, 1100–1200 × 2100–2400, sills 700–900, all `faces_seen` 1 — almost certainly real; the reference (traced on the 1 200 mm cut) drew those façades solid, so it cannot judge windows.
- **`faces_seen` bug:** `wall_openings` sets 2 whenever two holes overlap (`scan-L00-wall-31-window-1` reads 2 on a one-face wall).
- **Deviation** (99 traced walls fitted from the cloud, MA-4h-3 finding 3): p95 ≤ 20 mm: in place 15/99 within. Pooled share within 25 mm ≥ 0.4: in place 92, shift 20 → 86 within, shift 50 → 2, shift 100 → 19 (all 70–120 mm thick: a thin wall shifted by its thickness lands on its other face), 50 mm too thick → 48. The survey's own face fits: median rmse 4.4 mm, max 12.3. Nearest-face ownership already equals "own side of the centreline" — only a per-face judge (both faces must pass) catches the 100 mm case.
- **Pre-tick:** fit rms ≤ 20 holds by construction (inliers within CELL = 20 mm); faceDev passes 77 of 78 paired walls → in practice every paired wall on a checked storey is pre-ticked: 77 on Kladno, 46 traced (0.60).
- **Pair minimum:** PAIR_MIN 80 / 100 lowers wall F1 @100 (0.357 → 0.350 / 0.345); a minimum re-pairs junk into 65–212 mm widths and turns the 9 real 1F partitions at 76–98 mm into 18 one-face walls. **No minimum.** Instead the scan-only gate: of the 16 pairs under 100 mm, 7 are suspect (40/51/56/83 mm on no traced wall; 68/70/81 mm with lopsided faces), all with gap / rmse < 9.7; every pair matching a traced wall at 50 mm has gap / rmse ≥ 12.7 → `THICK_SCATTER` 10 sits in the window (one building, one tracer: a knob, not a constant).

## Files

| File | Change |
|---|---|
| `survey/pipeline.py` | `deviation` adds per-element `faces: [{points, share_within, coverage}]`; `wall_openings` counts distinct faces; `THICK_SCATTER` + `thickness_trusted(gap, rms)`; the wall emit withholds an untrusted thickness as `faces_apart_mm` |
| `survey/service.py` | VERSION 0.6.0 |
| `survey/test_survey.py` | Deviation per-face cases; a one-face wall's two overlapping holes read 1; the gate's knob pins; version |
| `WebApp/bridge/survey-plan.mjs` | door rule (`once`), `NOT_TRUSTED` gap + hold words, wall pre-tick off, `DEVIATION_MM` / `FACE_SHARE_MIN`, per-face `judge`, `measureRefusal` accepts and checks `faces` |
| `WebApp/bridge/build-jobs.mjs` | `TOLERANCES_MM = [25, 50, 100, 200]` |
| `WebApp/bridge/changesets-store.mjs` | the planner row's `storeys[].doors_seen_once`; the verify row's `deviation {within_mm, face_share_min, per: "face"}` and each element's `faces` |
| `WebApp/bridge/fixtures/changeset-ops/contract2-survey.json` | walls `pretick: false` |
| `tools/promote-check/Trust.cs` | the survey fixture's walls open unticked |
| `WebApp/src/setups/evidence.ts` | Propose line (doors seen once, the pre-tick words); candidate line (thickness not trusted) |
| `WebApp/src/setups/review-desk.ts` | per-face verdict words; old rows keep "(20 mm, p95)" |
| `WebApp/package.json` | 1.0.73 |
| `docs/strategy/2026-09-30-model-automation-design.md`, this plan | the bars; as built |

---

### Task 0 (T-1): measure the per-face verdict before fixing its threshold

Runs after Task 1 (it uses the new `deviation`). In memory, scratchpad only (`ma4h3/dev2.py`), about 3 minutes.

- [ ] **Step 1:** Fit the reference walls as `dev.py` does (`reference-5a.json`, sha 61ee7e01…; each face its densest 10 mm bin within 400 mm), then measure with `tols = (10, 20, 25, 50, 100, 200)`: in place; shifted 20, 50, 100 mm; 50 mm too thick; plus the job's own **paired candidates as filed** (centreline ± thickness / 2, floor to floor + 2 600 mm) split into those matching a traced wall at 100 mm (`reference.match`) and those matching none.
- [ ] **Step 2:** For each case, window w ∈ {10, 20, 25} mm and threshold T from 0.20 to 0.60 by 0.05, count walls within under the per-face rule (every face with an interior: points > 0 and share_w ≥ T).
- [ ] **Step 3: Decision rule.** Window 25 mm unless 10 or 20 meets the bars below with more margin. `FACE_SHARE_MIN` = the highest T at which walls in place read ≥ 90 % within. Then report, against the bars: 50 mm shift ≥ 95 % out; walls ≤ 140 mm shifted 100 mm ≥ 90 % out; unmatched candidates as filed (reported). Record the table in this plan's As built. If no T reaches 90 % in place, stop and report — the verdict ships p95 unchanged.

### Task 1: per-face deviation numbers (survey)

**Files:** Modify `survey/pipeline.py` (`deviation`); Test `survey/test_survey.py` (`Deviation`).

**Interfaces:** Produces each element's `faces: [{"points": int, "share_within": {str(t): share} | None, "coverage": float | None}]`, one per face sent, in order; a face without an interior is `{"points": 0, "share_within": None, "coverage": None}`. The pooled numbers are unchanged.

- [ ] **Step 1: Write the failing tests** (in `class Deviation`; `TOLS` stays `[50, 100, 200]`):

```python
    def test_each_face_has_its_own_numbers_in_the_order_sent(self):
        (m,) = pipeline.deviation(self.P, [self.wall()], self.TOLS)
        self.assertEqual(len(m["faces"]), 2)
        self.assertEqual(sum(f["points"] for f in m["faces"]), m["points"])
        for f in m["faces"]:
            self.assertEqual(f["share_within"], {"50": 1.0, "100": 1.0, "200": 1.0})
            self.assertGreaterEqual(f["coverage"], 0.98)

    def test_a_face_not_scanned_reads_no_point_and_the_other_face_its_own(self):
        P = self.P[np.abs(self.P[:, 1]) >= 10]  # the south wall's outer face (y 0) not scanned
        (m,) = pipeline.deviation(P, [self.wall()], self.TOLS)
        seen = [f for f in m["faces"] if f["points"]]
        self.assertEqual(len(seen), 1, m["faces"])
        self.assertEqual(seen[0]["share_within"]["50"], 1.0)
        empty = [f for f in m["faces"] if not f["points"]][0]
        self.assertEqual((empty["share_within"], empty["coverage"]), (None, 0.0))

    def test_a_face_without_interior_is_listed_empty(self):
        (m,) = pipeline.deviation(self.P, [{"guid": "stub", "faces": wall_faces((125, 150), (450, 150), 300, 0, 2800)}], self.TOLS)
        self.assertEqual(m["faces"], [{"points": 0, "share_within": None, "coverage": None}] * 2)
```

and in `test_a_wall_where_it_was_scanned_is_a_few_mm_off_both_faces_seen_numbers_only` the key set gains `"faces"`.

- [ ] **Step 2:** `cd survey && PYTHONPATH="$APPDATA/Sentinel/survey-lib" python -m unittest test_survey.Deviation` → FAIL (`KeyError: 'faces'`).

- [ ] **Step 3: Implement** — the per-element loop of `deviation` becomes:

```python
    out = []
    for k, e in enumerate(elements):
        ds, filled, cells, per = [], 0, 0, []
        for i, (kk, o, u, la, v, lb, _) in enumerate(F):
            if kk != k:
                continue
            nu, nv = math.ceil((la - 2 * EDGE) / DEV_CELL), math.ceil((lb - 2 * EDGE) / DEV_CELL)
            if nu <= 0 or nv <= 0:
                per.append({"points": 0, "share_within": None, "coverage": None})  # MA-5a-2: no interior, not judged
                continue
            j = np.flatnonzero(owner == i)
            ds.append(sd[j])
            cells += nu * nv
            R = Q[j] - o  # every point the face owns (already within BAND): a face seen but far off is seen, and p95 judges it
            cu = np.minimum(np.floor((R @ u - EDGE) / DEV_CELL), nu - 1).astype(np.int64)
            cv = np.minimum(np.floor((R @ v - EDGE) / DEV_CELL), nv - 1).astype(np.int64)
            f = np.unique(cu * nv + cv).size
            filled += f
            af = np.abs(sd[j])
            # MA-5a-2: each face's own numbers — the bridge judges each face (both must pass): pooled, a thin wall shifted by its thickness
            # still had its two real surfaces near its faces (19 of Kladno's 31 walls of 140 mm or less read within at 100 mm off)
            per.append({"points": int(j.size), "share_within": {str(t): round(float((af <= t).mean()), 3) for t in tols} if j.size else None,
                        "coverage": round(f / (nu * nv), 3)})
        d = np.concatenate(ds) if ds else np.zeros(0)
        a = np.abs(d)
        out.append({"guid": e["guid"], "points": int(d.size),
                    "p95_mm": round(float(np.percentile(a, 95)), 1) + 0.0 if d.size else None,  # + 0.0: never -0.0
                    "mean_signed_mm": round(float(d.mean()), 1) + 0.0 if d.size else None,
                    "share_within": {str(t): round(float((a <= t).mean()), 3) for t in tols} if d.size else None,
                    "coverage": round(filled / cells, 3) if cells else None, "faces": per})
    return out
```

and the docstring's `→` line gains "faces [{points, share_within, coverage}] per face sent, in order (MA-5a-2)".

- [ ] **Step 4:** run `test_survey.Deviation` → PASS; then the whole suite (`python -m unittest test_survey`) → OK.
- [ ] **Step 5: Commit** `feat(survey): MA-5a-2 - deviation gives each face its own numbers (points, shares, coverage) beside the pooled ones`.

### Task 2: `faces_seen` = distinct faces, and the thickness gate (survey 0.6.0)

**Files:** Modify `survey/pipeline.py` (`wall_openings`, the wall emit in `measure`, the knobs block), `survey/service.py:25`; Test `survey/test_survey.py`.

**Interfaces:** Produces walls whose `measured` holds `thickness_mm` (trusted) or `faces_apart_mm` (two faces, thickness withheld), never both; `thickness_trusted(gap_mm, rms_mm) -> bool`; opening `fit.faces_seen` ∈ {1, 2} = distinct faces.

- [ ] **Step 1: Write the failing tests** (a new `class TrustRules(unittest.TestCase)`):

```python
class TrustRules(unittest.TestCase):
    """MA-5a-2: a hole counted per face, not per overlap; a thickness kept only clear of its faces' scatter (§0 of the plan)."""

    def face(self, holes_at, rows=40, cols=60):
        g = np.ones((rows, cols), bool)
        for r0, r1, c0, c1 in holes_at:
            g[r0:r1, c0:c1] = False
        return {"seg": (0.0, 0.0, cols * pipeline.GRID, 0.0), "len": cols * pipeline.GRID, "grid": g}

    def test_two_holes_on_one_face_overlapping_along_are_one_opening_seen_once(self):
        # a door and the glazed panel above its transom bar, on a wall seen from one side: never "both faces"
        f = self.face([(0, 21, 20, 30), (23, 34, 20, 30)])
        (o,) = pipeline.wall_openings([f], (0.0, 0.0, 6000.0, 0.0), 0.0, 4300.0)
        self.assertEqual(o[0], "door")
        self.assertEqual(o[-1], 1)

    def test_one_hole_on_each_face_is_seen_twice(self):
        a, b = self.face([(0, 21, 20, 30)]), self.face([(0, 21, 20, 30)])
        (o,) = pipeline.wall_openings([a, b], (0.0, 0.0, 6000.0, 0.0), 0.0, 4300.0)
        self.assertEqual(o[-1], 2)

    def test_a_thickness_is_kept_only_ten_times_clear_of_its_scatter(self):
        self.assertEqual(pipeline.THICK_SCATTER, 10.0)
        self.assertTrue(pipeline.thickness_trusted(101, 7.2))    # a real 1F partition on Kladno (ratio 14.0)
        self.assertTrue(pipeline.thickness_trusted(76, 6.0))     # the lowest matched ratio, 12.7 — pinned from above
        self.assertFalse(pipeline.thickness_trusted(83, 9.6))    # a suspect pair on no traced wall (ratio 8.6) — pinned from below
        self.assertTrue(pipeline.thickness_trusted(300, 0.0))    # a noiseless synthetic face
```

plus, in the existing measure-on-`building()` tests (`class Openings` / the walls cases), one assertion that every two-face wall keeps `thickness_mm` and carries no `faces_apart_mm`; the version test's `"0.5.0"` becomes `"0.6.0"`.

- [ ] **Step 2:** run `python -m unittest test_survey.TrustRules` → FAIL (`AttributeError: THICK_SCATTER`; the one-face case reads 2).

- [ ] **Step 3: Implement.** Knobs block, after `SPECK`:

```python
THICK_SCATTER = 10.0  # MA-5a-2: a pair's faces this many times their fit scatter (rms) apart or more measure a thickness; closer, the wall
                      # keeps its faces and centreline but no thickness (faces_apart_mm) — never typed, a person draws it. Kladno: every pair
                      # matching a traced wall at 50 mm reads >= 12.7, every suspect thin pair < 9.7 (one building, one tracer: a knob)


def thickness_trusted(gap, rms):
    return gap >= THICK_SCATTER * rms
```

`wall_openings`: `for fi, x in enumerate(two):`, `found.append([a0, a1, r0, r1, border, cells, {fi}])`, the merge's last line becomes

```python
                o[4], o[5] = (o[4] * o[5] + h[4] * h[5]) / (o[5] + h[5]), o[5] + h[5]
                o[6] = o[6] | h[6]  # MA-5a-2: the faces it was seen on — two holes on one face are seen once (a door and the glazing above it)
```

and the emit loop `for a0, a1, r0, r1, border, cells, faces in openings:` … `out.append((kind, a0, a1, lo, hi, border, cells, len(faces)))`.

The wall emit (inside `for n, (x1, y1, x2, y2, t, i, j) in enumerate(pair(...), 1):`):

```python
            two = [fs[i]] + ([fs[j]] if j >= 0 else [])
            pts = np.concatenate([x["points"] for x in two])
            rms = math.sqrt(sum(len(x["points"]) * x["rmse"] ** 2 for x in two) / len(pts))
            thick = ({"thickness_mm": r(t)} if thickness_trusted(t, rms) else {"faces_apart_mm": r(t)}) if j >= 0 else {}
            # "measured": {"length_mm": …, "height_mm": …, **thick}; "fit": fit(len(pts), rms, min(x["coverage"] for x in two))
```

`service.py:25`: `VERSION = "0.6.0"  # MA-5a-2: each face's own deviation numbers; faces_seen counts distinct faces; a thickness only clear of its faces' scatter (faces_apart_mm otherwise). A job read by 0.5.0 is proposed as before; a measure of one fails in words (changesets-store verify)`.

- [ ] **Step 4:** `python -m unittest test_survey` → OK.
- [ ] **Step 5: Commit** `feat(survey): MA-5a-2 - sentinel-survey 0.6.0: faces_seen counts distinct faces; a pair's thickness only when its faces are 10 x clear of their scatter (faces_apart_mm otherwise)`.

### Task 3: the planner — doors seen through, no wall pre-tick, untrusted thickness (bridge)

**Files:** Modify `WebApp/bridge/survey-plan.mjs`, `WebApp/bridge/changesets-store.mjs` (`file()` storeys map), `WebApp/bridge/fixtures/changeset-ops/contract2-survey.json` (walls `"pretick": false`), `tools/promote-check/Trust.cs`; Test `WebApp/bridge/survey-plan.test.mjs`, `WebApp/bridge/changesets-store.test.mjs`.

**Interfaces:** `planSurvey` storeys gain `once: string[]` (door cids seen on one face, not proposed); `NOT_TRUSTED = "thickness not trusted"`; the build:run row's storeys gain `doors_seen_once: string[]` when non-empty.

- [ ] **Step 1: Write the failing tests** (survey-plan.test.mjs, beside the MA-5a opening cases; `plan`, `DOOR`, `SIZE` are that file's helpers):

```js
  it("MA-5a-2: a door is proposed only when seen on both faces; a window is not filtered; the doors seen once are listed", () => {
    const once = { ...DOOR, fit: { ...DOOR.fit, faces_seen: 1 } };
    const p = plan([once], SIZE);
    expect(p.storeys[0].once).toEqual([DOOR.cid]);
    expect(p.storeys[0].body?.elements.some((e) => e.cid === DOOR.cid) ?? false).toBe(false);
    expect(p.storeys[0].exceptions.some((e) => e.unique_id === DOOR.cid)).toBe(false); // not held: not proposed at all
    expect(plan([DOOR], SIZE).storeys[0].once).toEqual([]); // faces_seen 2 (a 0.5.0 job's numbers read the same)
  });
  it("MA-5a-2: a scan wall is never pre-ticked; a created level still is", () => {
    const p = plan([], SIZE);
    for (const s of p.storeys) for (const [cid, t] of s.byCid) expect(t.pretick).toBe(cid.endsWith("-level") && s.storey.how === "created");
  });
  it("MA-5a-2: a wall whose thickness is withheld is a 'thickness not trusted' gap, and holds its door in those words", () => {
    const p = plan([DOOR], SIZE, { untrusted: DOOR.geometry.host }); // the host's thickness withheld: faces 70 mm apart, fit 9 mm
    const g = p.groups.find((x) => x.size === "thickness not trusted");
    expect(g.key).toBe("its two faces 70 mm apart against a 9 mm fit scatter — too close to trust a thickness");
    expect(p.storeys[0].exceptions.find((e) => e.unique_id === DOOR.cid).reason).toBe(`its host wall ${DOOR.geometry.host}'s thickness is not trusted (its two faces 70 mm apart against a 9 mm fit scatter — too close to trust a thickness), so it is never typed — a person draws the wall and this door`);
  });
```

(`plan`'s options gain `untrusted`: that host's candidate is rewritten with `measured.faces_apart_mm: 70`, no `thickness_mm`, `fit.rmse_mm: 9`.) In changesets-store.test.mjs's test (m), add a one-face door on L00 and expect `planner.storeys[0].doors_seen_once` to equal its cid; test (a)'s `preticked` per changeset becomes the created level's 1 or 0.

- [ ] **Step 2:** `npx vitest run bridge/survey-plan.test.mjs bridge/changesets-store.test.mjs` → FAIL.

- [ ] **Step 3: Implement** in survey-plan.mjs:

```js
export const NOT_MEASURED = "thickness not measured";
export const NOT_TRUSTED = "thickness not trusted"; // MA-5a-2: two faces, but too close for their scatter (sentinel-survey faces_apart_mm)
```

`trust`'s pretick:

```js
      // MA-5a-2 (the founder's call): a scan's walls are never pre-ticked until a reference shows >= 0.8 of a scan's paired walls are traced
      // walls (Kladno 0.5.0: 46 of 77, 0.60) — the fit cannot fail (a face's inliers lie within CELL, 20 mm, by construction), so it never
      // told a wall from a cupboard; a created level keeps its pre-tick (its height is checked against the published levels)
      pretick: c.kind === "level" && status === "within_tolerance" && s.checked
```

(`sized` is then unused — deleted.) The gap reason gains `c.kind === "wall" && g.size === NOT_TRUSTED ? \`its thickness is not trusted (${g.key})\`` before the NOT_MEASURED case. The typed walls:

```js
      if (!Number.isFinite(t)) return { gap: Number.isFinite(c.measured.faces_apart_mm)
        ? { category: "Walls", want: null, size: NOT_TRUSTED, key: `its two faces ${c.measured.faces_apart_mm} mm apart against a ${c.fit?.rmse_mm} mm fit scatter — too close to trust a thickness`, nearest: [] }
        : { category: "Walls", want: null, size: NOT_MEASURED, key: "one face seen", nearest: [] } };
```

The opening loop, after `if (again(c)) continue;`:

```js
      // MA-5a-2 (the founder's call, plan §0): a door is proposed only when its hole shows in both faces of its wall — on Kladno the doors
      // seen on one face were 3 real in 25 on two-face walls and 1 in 22 on one-face walls; a closed leaf or furniture reads the same. A
      // window is not filtered: a façade's windows are seen from inside only. ponytail: a closed door in a thick wall is not proposed (all 3
      // real doors lost were in 338-509 mm walls) — a person draws it.
      if (c.kind === "door" && !((c.fit?.faces_seen ?? 0) >= 2)) { once.push(c.cid); continue; }
```

with `once = []` declared beside `exceptions` and returned on both returns. The host hold:

```js
        const hg = typed[hi].gap;
        hold(hg.size === NOT_MEASURED ? `its host wall ${host} was seen on one face only, so it is never typed — a person draws the wall and this ${c.kind}`
          : hg.size === NOT_TRUSTED ? `its host wall ${host}'s thickness is not trusted (${hg.key}), so it is never typed — a person draws the wall and this ${c.kind}`
          : `its host wall ${host} is a type gap — propose the job again once the wall's group in the Holding Area closes`);
```

changesets-store.mjs `file()` storeys map: `return { ...storeyRecord(p.storey), changeset, ...(held.length ? { held } : {}), ...(p.once.length ? { doors_seen_once: p.once } : {}) };`.

The fixture: the three walls' `"pretick": true` → `false`. `tools/promote-check/Trust.cs`: the survey walls' assertion becomes `e.Pretick == false && … && !ChangesetTrust.PreTick(sv, e)`, "…(MA-5a-2) never pre-ticked: a scan's walls open unticked".

- [ ] **Step 4:** vitest (both files) → PASS; `cd tools/promote-check && dotnet run` → all pass.
- [ ] **Step 5: Commit** `feat(bridge): MA-5a-2 - a door is proposed only when seen on both faces (the rest listed on the planner's row); a scan's walls are never pre-ticked; a withheld thickness is its own gap and holds its openings in words`.

### Task 4: the per-face verdict at 25 mm (bridge)

**Files:** Modify `WebApp/bridge/survey-plan.mjs` (`judge`, `MEASURE_KEYS`, `measureRefusal`), `WebApp/bridge/build-jobs.mjs:23`, `WebApp/bridge/changesets-store.mjs` (verify's element rows and value); Test `WebApp/bridge/survey-plan.test.mjs`, `WebApp/bridge/changesets-store.test.mjs`.

**Interfaces:** `DEVIATION_MM = 25`, `FACE_SHARE_MIN` (Task 0); `judge(m, k)` reads `m.faces`; the verify row gains `deviation: {within_mm, face_share_min, per: "face"}` (no `target_mm`), each measured element its `faces`.

- [ ] **Step 1: Write the failing tests** (survey-plan.test.mjs; `K = { band_mm: 400, edge_mm: 200, cell_mm: 200 }`; `F = (points, s25) => ({ points, coverage: 0.9, share_within: { 25: s25, 50: 1, 100: 1, 200: 1 } })`):

```js
  it("MA-5a-2: judge — each face with an interior must have FACE_SHARE_MIN of its points within 25 mm", () => {
    const M = (faces) => ({ guid: "g", points: faces.reduce((s, f) => s + f.points, 0), p95_mm: 300, mean_signed_mm: 0, coverage: 0.9, share_within: { 25: 0.5, 50: 1, 100: 1, 200: 1 }, faces });
    expect(judge(M([F(900, 0.97), F(800, 0.95)]), K)).toEqual({ status: "within_tolerance" }); // p95 300 mm: clutter no longer decides
    const lo = judge(M([F(900, 0.97), F(800, 0.1)]), K);
    expect(lo.status).toBe("out_of_tolerance");
    expect(lo.reason).toBe(`face 2: 10% of its points within 25 mm — each face needs ${Math.round(FACE_SHARE_MIN * 100)}% (this check cannot see a 20 mm offset, nor a thin partition moved by its own thickness)`);
    expect(judge(M([F(900, 0.97), { points: 0, coverage: 0, share_within: null }]), K).reason).toMatch(/^face 2: no scan point within 400 mm/);
    expect(judge(M([F(900, 0.97), { points: 0, coverage: null, share_within: null }]), K)).toEqual({ status: "within_tolerance" }); // no interior: not judged
  });
  it("MA-5a-2: measureRefusal — faces is the contract: one per face sent, numbers in range, points adding up", () => {
    const send = [{ guid: "g", faces: [[], []] }], T = [25, 50, 100, 200];
    const res = (faces) => ({ receipt: { measure: K }, elements: [{ guid: "g", points: 1700, p95_mm: 3, mean_signed_mm: 0, coverage: 0.9, share_within: { 25: 1, 50: 1, 100: 1, 200: 1 }, faces }] });
    expect(measureRefusal(res([F(900, 1), F(800, 1)]), send, T)).toBeNull();
    expect(measureRefusal(res(undefined), send, T)).toBe("elements[0].faces");
    expect(measureRefusal(res([F(900, 1)]), send, T)).toBe("elements[0].faces");
    expect(measureRefusal(res([F(900, 1), F(700, 1)]), send, T)).toBe("elements[0].faces"); // 1600 ≠ 1700
    expect(measureRefusal(res([F(900, 1.2), F(800, 1)]), send, T)).toBe("elements[0].faces");
  });
```

and in changesets-store.test.mjs's verify suite: the stored row carries `deviation: { within_mm: 25, face_share_min: FACE_SHARE_MIN, per: "face" }`, no `target_mm`, each measured element its `faces`; the service stub's results gain `faces` (two per wall, points adding up).

- [ ] **Step 2:** vitest → FAIL.

- [ ] **Step 3: Implement.** survey-plan.mjs, beside `TOLERANCE_MM`:

```js
// MA-5a-2 (the founder's call on open question 8, plan Task 0): a placed survey wall is judged per face on the share of the face's own points
// within DEVIATION_MM — p95 refused 84 of Kladno's 99 walls in place (clutter in the band); pooled shares let a thin wall moved by its
// thickness pass. TOLERANCE_MM stays the level match and the fit status.
export const DEVIATION_MM = 25, FACE_SHARE_MIN = 0.3; // FACE_SHARE_MIN: Task 0's measured value
const DEV_LIMITS = "this check cannot see a 20 mm offset, nor a thin partition moved by its own thickness";
```

`judge`'s last line becomes:

```js
  const pct = (v) => `${Math.round(v * 100)}%`;
  const off = m.faces.map((f, i) => ({ f, i })).filter(({ f }) => f.coverage != null && (!f.points || f.share_within[DEVIATION_MM] < FACE_SHARE_MIN));
  if (!off.length) return { status: "within_tolerance" };
  return { status: "out_of_tolerance", reason: off.map(({ f, i }) => `face ${i + 1}: ${f.points ? `${pct(f.share_within[DEVIATION_MM])} of its points within ${DEVIATION_MM} mm` : `no scan point within ${k.band_mm} mm`}`).join("; ") +
    ` — each face needs ${pct(FACE_SHARE_MIN)} (${DEV_LIMITS})` };
```

`MEASURE_KEYS` gains `"faces"`; `measureRefusal`, after the share check:

```js
    const fs = m.faces;
    if (!Array.isArray(fs) || fs.length !== send[i].faces.length || fs.some((f) => !f || !Number.isInteger(f.points) || f.points < 0 || (f.coverage !== null && !share(f.coverage))
        || (f.points > 0 ? !tols.every((t) => share(f.share_within?.[t])) : f.share_within != null))
        || fs.reduce((s, f) => s + f.points, 0) !== m.points) return `${at}.faces`;
```

build-jobs.mjs:23: `export const TOLERANCES_MM = [25, 50, 100, 200]; // the contract's (§6.9); MA-5a-2: 25 is the per-face verdict's (survey-plan DEVIATION_MM); the band stays 2 x 200`.

changesets-store.mjs verify: each element's numbers gain `faces: m.faces.map((f) => ({ points: f.points, coverage: f.coverage, share_within: f.points ? Object.fromEntries(TOLERANCES_MM.map((t) => [String(t), f.share_within[t]])) : null }))`; the value's `target_mm: TOLERANCE_MM` becomes `deviation: { within_mm: DEVIATION_MM, face_share_min: FACE_SHARE_MIN, per: "face" }`.

- [ ] **Step 4:** vitest (bridge) → PASS.
- [ ] **Step 5: Commit** `feat(bridge): MA-5a-2 - a placed survey wall is judged per face on its share within 25 mm (each face with an interior must pass); the contract carries each face's numbers; TOLERANCES_MM gains 25`.

### Task 5: the web's words (1.0.73)

**Files:** Modify `WebApp/src/setups/evidence.ts` (`ProposeReply`, `proposeLine`, `candidateLine`), `WebApp/src/setups/review-desk.ts` (`Measured`, `VerifyRecord`, `measureWords`, the verify read, its caller), `WebApp/package.json`; Test `evidence.test.ts`, `review-desk.test.ts`.

**Interfaces:** `measureWords(m, rec?: { target_mm?: number; deviation?: { within_mm: number; face_share_min: number } })`.

- [ ] **Step 1: Write the failing tests.** evidence.test.ts:

```js
    expect(proposeLine({ ...REPLY, storeys: [{ ...REPLY.storeys[0], doors_seen_once: ["a", "b", "c"] }, REPLY.storeys[1]] }))
      .toContain(" · 3 door hole(s) seen on one face only — not proposed (a closed door or furniture reads the same; a person draws a door the scan missed)");
    expect(candidateLine({ cid: "scan-L00-wall-4", kind: "wall", geometry: { faces: [[0, 0, 1, 0], [0, 40, 1, 40]] }, measured: { length_mm: 3400, height_mm: 2900, faces_apart_mm: 40 },
      evidence: ["ev-0001#slice-L00"], fit: { inliers: 200, rmse_mm: 9.6, coverage: 0.8 } }))
      .toContain(" · its two faces 40 mm apart against a 9.6 mm scatter: its thickness is not trusted");
```

and the existing exact Propose line's "4 pre-ticked on the Review desk (Revit opens them ticked too, less what the office IDS rejects; a person clicks Apply)" becomes "4 pre-ticked on the Review desk (a level the scan created — a person ticks every scan wall, door and window; Revit leaves unticked what the office IDS rejects)". review-desk.test.ts:

```js
    const DEV = { within_mm: 25, face_share_min: 0.3 };
    expect(measureWords({ ...IN, faces: [{ points: 1800, coverage: 1, share_within: { 25: 0.97, 50: 1, 100: 1, 200: 1 } }, { points: 1712, coverage: 1, share_within: { 25: 0.95, 50: 1, 100: 1, 200: 1 } }] }, { deviation: DEV }))
      .toBe("within tolerance (each face 30% within 25 mm) · faces within 25 mm: 97% / 95% · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points");
    expect(measureWords(IN, { target_mm: 20 })).toBe("within tolerance (20 mm, p95) · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points"); // an old row
```

(the existing `measureWords(IN)` call keeps its old words: no record means the old rule.)

- [ ] **Step 2:** vitest (both) → FAIL.

- [ ] **Step 3: Implement.** evidence.ts — `ProposeReply.storeys` items gain `doors_seen_once?: string[]`; `proposeLine`:

```ts
  const once = r.storeys.reduce((s, x) => s + (x.doors_seen_once?.length ?? 0), 0);
  const seenOnce = once ? ` · ${once} door hole(s) seen on one face only — not proposed (a closed door or furniture reads the same; a person draws a door the scan missed)` : "";
  return `✓ Proposed ${r.job} — ${r.changesets.length} changeset(s), ${ghosts} ghost(s), ${pre} pre-ticked on the Review desk (a level the scan created — a person ticks every scan wall, door and window; Revit leaves unticked what the office IDS rejects) · ` +
    `${r.gaps.groups} type-gap group(s), ${r.gaps.elements} element(s) in the Holding Area${held}${seenOnce} · ${levels}${again}${placed} · ${ledgerLine(r.ledger)} — Review ▸ ↻`;
```

`candidateLine`'s `one`:

```ts
  const apart = (c.measured as Record<string, number>).faces_apart_mm;
  const one = Array.isArray(c.geometry.faces) && c.geometry.faces.length === 1 ? " · one face seen: its thickness is unknown"
    : apart != null ? ` · its two faces ${apart} mm apart against a ${c.fit?.rmse_mm} mm scatter: its thickness is not trusted` : "";
```

review-desk.ts — `Measured` gains `faces?: { points: number; coverage: number | null; share_within: Record<string, number> | null }[]`; `VerifyRecord` gains `deviation?: { within_mm: number; face_share_min: number }`; the verify read carries `deviation: v.deviation`; `measureWords`:

```ts
export function measureWords(m: Measured, rec: { target_mm?: number; deviation?: { within_mm: number; face_share_min: number } } = {}): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`, sw = m.share_within, dv = rec.deviation;
  const judged = m.status === "within_tolerance" || m.status === "out_of_tolerance";
  const rule = dv ? ` (each face ${pct(dv.face_share_min)} within ${dv.within_mm} mm)` : ` (${rec.target_mm ?? 20} mm, p95)`;
  const at = dv ? String(dv.within_mm) : null;
  const faces = dv && m.faces?.some((f) => f.share_within) ? [`faces within ${dv.within_mm} mm: ${m.faces.map((f) => (f.share_within ? pct(f.share_within[at!]) : "—")).join(" / ")}`] : [];
  const rest = sw ? Object.entries(sw).filter(([t]) => t !== at) : [];
  return [`${m.status.replace(/_/g, " ")}${judged ? rule : ""}`, ...faces,
    ...(m.p95_mm != null ? [`p95 ${m.p95_mm} mm`] : []),
    ...(m.mean_signed_mm != null ? [`mean ${m.mean_signed_mm > 0 ? "+" : ""}${m.mean_signed_mm} mm (+ = the scan outside it)`] : []),
    ...(m.coverage != null ? [`${pct(m.coverage)} of its faces seen`] : []),
    ...(rest.length ? [`within ${rest.map(([t]) => t).join(" / ")} mm: ${rest.map(([, v]) => pct(v)).join(" / ")}`] : []),
    ...(m.points ? [`${m.points} points`] : []),
    ...(m.reason ? [m.reason] : [])].join(" · ");
}
```

and its caller passes `rec`. `package.json` → `"version": "1.0.73"`.

- [ ] **Step 4:** `npx vitest run` (whole suite) → PASS; `npx tsc --noEmit -p .` → no new error in the touched files.
- [ ] **Step 5: Commit** `feat(web): MA-5a-2 - the Propose line names the doors seen once and who ticks a scan's ghosts; a withheld thickness in words; the desk's per-face verdict (old rows keep p95)` and `chore(web): 1.0.73`.

### Task 6: the bars, as built, the drill

- [ ] **Step 1:** In `docs/strategy/2026-09-30-model-automation-design.md`, replace the acceptance defaults with the founder's bars:
  - **Gates (each survey version):** every traced storey found, |level error| ≤ 20 mm; ≤ 200 candidate walls per storey; ≤ 5 min and ≤ 2.5 GB per Kladno job; the synthetic tests; **walls, both storeys pooled, lose at most 1 true positive at each d** against the previous version. Openings and each storey are reported, not gated.
  - **Targets (not gates until a second reference — a second tracer or building — exists):** "the 1F" wall F1 @100 ≥ 0.6 (in-sample since MA-5a); a scan's walls pre-ticked again only when ≥ 0.8 of its paired walls are traced walls.
  - **Deviation (per face, at 25 mm):** in place ≥ 90 % within; a 50 mm shift ≥ 95 % out; walls ≤ 140 mm shifted 100 mm ≥ 90 % out; 50 mm too thick reported; no insufficient-data bar (empty by the test's selection).
- [ ] **Step 2:** This plan's As built: T-1's table, the chosen `FACE_SHARE_MIN`, the test counts, the review's findings.
- [ ] **Step 3: Drill MA5a2** (after merge, bridge restart, web publish, the founder's Funnel refresh):

| Row | What | Bar |
|---|---|---|
| K-1 | Kladno job on 0.6.0 (`kladno-drill`) | ≤ 5 min, ≤ 2.5 GB; version 0.6.0 |
| K-2 | `score` against reference-5a | walls pooled TP ≥ 0.5.0's − 1 at each d; `faces_apart_mm` on the suspect thin pairs (expected 8), none on a pair matching a traced wall at 50 mm; openings reported |
| K-3 | Propose at the MA-4h frame | the line names the doors seen once; 0 walls pre-ticked; a "thickness not trusted" group in the Holding Area |
| R-1 | Drill building job on 0.6.0 (`ma4c-drill`), Propose, levels blank | walls not pre-ticked, the level pre-ticked; the window typed by rule (guideline@2); the door proposed (both faces) or a gap in words |
| R-2 | Revit 2024: tick wall-5, the window, Apply | placed; one Undo |
| V-1 | Measure against the scan | the row's `deviation {within_mm 25, face_share_min, per "face"}`; the wall within with both faces' shares; the desk's words |
| V-2 | The old row #2290 on the desk | "(20 mm, p95)" kept |

- [ ] **Step 4: Commit** the docs; merge `--no-ff`; restart 4100; publish web 1.0.73; secret scan; push.

## Self-review

- Spec coverage: (1) Task 3 + Task 2's faces_seen; (2) Tasks 0, 1, 4, 5; (3) Task 3; (4) Task 2 + Task 3 words; (5) Task 6. Pair minimum: none built (§0).
- Types: `once` (planSurvey) → `doors_seen_once` (row, ProposeReply); `faces` (deviation → measureRefusal → judge → verify row → Measured); `deviation` (row → VerifyRecord → measureWords) — names match across tasks.
- Review Focus lines 1–5 each have a test in Tasks 3, 4, 5.

## As built and measured (2026-10-11)

**Task 0 (T-1), the per-face verdict on Kladno** (`dev2.py`, the worktree's per-face `deviation`; 99 traced walls fitted from the cloud; the
0.5.0 job's 78 paired candidates as filed, 47 matching a traced wall at 100 mm, 31 not). Within, under "every face with an interior holds
≥ T of its points within w mm":

| w @ T | in place | shift 20 | shift 50 | shift 100 (≤ 140 mm walls) | 50 mm too thick | filed, matched | filed, unmatched |
|---|---|---|---|---|---|---|---|
| 10 @ 0.20 | 84 / 99 | 1 | 1 | 0 / 31 | 0 | 40 / 47 | 19 / 31 |
| **20 @ 0.20** | **95 / 99** | **59** | **2** | **7 / 31** | **18** | **44 / 47** | **23 / 31** |
| 20 @ 0.25 | 89 / 99 | 50 | 2 | 4 / 31 | 5 | 43 / 47 | 23 / 31 |
| 25 @ 0.25 | 92 / 99 | 86 | 2 | 11 / 31 | 54 | 43 / 47 | 23 / 31 |
| 25 @ 0.30 | 86 / 99 | 78 | 2 | 6 / 31 | 38 | 42 / 47 | 21 / 31 |
| pooled 25 @ 0.4 (the earlier draft) | 92 / 99 | 86 | 2 | 19 / 31 | 48 | 44 / 47 | 26 / 31 |

**The window moved from 25 to 20 mm** by the plan's own rule: 20 mm at 0.2 is the highest share reaching 90 % in place at 20 mm, and it
beats 25 mm at its best threshold on every case (in place 96 % against 93 %; a 20 mm shift 40 % out against 13 %; thin walls shifted 100 mm
77 % out against 65 %; too thick 82 % out against 45 %). So `DEVIATION_MM = 20`, `FACE_SHARE_MIN = 0.2`, `TOLERANCES_MM = [20, 50, 100, 200]`
(the band stays 400). **The thin-wall bar (≥ 90 % out) is not met** — 77 %, from 39 % pooled; the words say so ("a thin partition moved by
its own thickness can pass"). **The verdict cannot judge precision:** the survey's own non-walls placed as filed pass (23 of 31) — placed from
the scan's own faces, they agree with the scan by construction; only a person tells a wall from a cupboard (hence no pre-tick).

**Kladno at 0.6.0, in memory** (`asb6.py`): walls F1 0.299 / 0.357 / 0.396 (TP 46 / 55 / 61) — equal to 0.5.0 at every d (the ratchet holds;
the gate moves no line); level errors GF +1.5, 1F +18.4 mm unchanged. **The thickness gate withholds 8 walls** — `scan-L00-wall-1` (70 mm
apart, 8.0 mm rms), `-4` (40, 10.9), `-6` (56, 11.7), `-8` (114, 11.7), `-10` (83, 11.7), `-14` (68, 9.1), `-17` (81, 9.0), `scan-L01-wall-36`
(51, 9.6): the review's 7 suspect thin pairs plus wall-8, none matching a traced wall at 50 mm. **`faces_seen` fixed:** the one window that
read 2 on a one-face wall now reads 1 (GF windows 7 × 1). **Doors under the bridge's rule** (both faces), doors only @100: F1 0.510, P 0.481,
R 0.542 (GF 1 / 8 / 6, 1F 12 / 6 / 5) — 0.5.0's count gave 0.500; the fixed count moved one false door out.

**Tests:** survey 94 OK; bridge + web 2981 pass, 1 skipped; promote-check 889 / 889; `tsc` — no error in a touched file.
