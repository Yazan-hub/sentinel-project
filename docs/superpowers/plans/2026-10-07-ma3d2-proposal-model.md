# MA-3d (slice 2) — the proposal model: a changeset's creates as a bridge-made `.frag`, shown in the web viewer beside the published model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second half of MA-3d (`docs/superpowers/plans/2026-10-07-ma3d-web-highlights.md` ▸ Next): a Review AI Proposals changeset's **creates** — the walls, floors, roofs and ceilings an agent or Ghost Builder proposed, which exist in no published model — become a small **proposal model**: the bridge writes them as an IFC with `sentinel-core`'s IFC writer (boxes: a wall's line, base and top; a slab's boundary box), converts it with its own `IfcImporter` (`bridge/ifc-to-frag.mjs`, the engine the outbox uses), and serves it as `GET /changesets/:key/:id/proposal.frag`; the web review desk's **Show creates in 3D** loads it into the viewer beside whatever is loaded, colours every item orange, and says what it shows and what it skipped; **Hide creates** disposes it. Nothing is written to any version; the proposal model is never a published model.

**Spike (done, 2026-10-07):** `buildIfc([one wall])` → `ifcBytesToFrag` in Node: 2,854 IFC bytes → 1,917 `.frag` bytes in 53 ms. `FragmentsModel.getItemsIdsWithGeometry()` exists in `@thatopen/fragments` 3.4.7; the highlighter takes a named style (`highlighter.styles.set("clash", { color, renderedFaces, opacity, transparent })` — `clash-panel.ts:294`). The **coordinate frame** is the pure mapping below (Revit mm, Z-up → the writer's three.js metres, Y-up); it is pinned offline and checked live by a create placed beside an existing wall of the loaded model.

**Architecture:**
- `WebApp/src/sentinel-core/bridge-entry.ts` exports `buildIfc` (and its `BakeElement` type); `npm run build:bridge-core` rebuilds `WebApp/bridge/sentinel-core.mjs` (LF-pinned since SEC-9).
- `WebApp/bridge/proposal-model.mjs` (new): `proposalElements(changeset, levelMmOf)` → `{ elements: BakeElement[], creates, drawn, skipped: string[] }` — pure; `proposalFrag(changeset, levelMmOf, deps)` → `{ bytes: Uint8Array | null, creates, drawn, skipped }` (writes the IFC through the core bundle's `buildIfc`, converts through `ifcBytesToFrag`).
- `WebApp/bridge/bcf-service.mjs`: the route in the changesets block, a member's read (`getChangeset` → `ensureProject` under the forwarded session; the machine credential as ever).
- `WebApp/src/setups/review-desk.ts`: per storey **Show creates in 3D** / **Hide creates**; a pure `proposalWords(...)`; the `"proposal"` highlighter style.

**Tech Stack:** Node bridge (vitest; `@thatopen/fragments` `IfcImporter` + `web-ifc` wasm in Node), TypeScript web on That Open (`FragmentsManager.core.load`, `OBF.Highlighter`), the `sentinel-core` bundle.

**Base:** `feature/ma3d2-proposal-model` at master `7c20273`. Repo root `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`. Every file:line below was read at `7c20273`.

## Global Constraints

- House style: words are sentences; comments name the slice ("MA-3d2") and the reason; exact words pinned. No new dependency. No migration. No add-in change. The web bump (1.0.55) is the controller's at the merge.
- Commit messages `feat(bridge|web): MA-3d2 - …` with a blank line and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit only on `feature/ma3d2-proposal-model`.
- Tests: `npx vitest run <files>` from `WebApp`; never a bare `node bridge/bcf-service.mjs`. The full suite is the final checks' (restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` if it shows as modified — line endings). `npm run build` must build; `tsc` is not a gate (17 pre-existing errors; no new one).
- The core bundle: after changing `bridge-entry.ts`, run `npm run build:bridge-core` from `WebApp` and commit `bridge/sentinel-core.mjs` with it (the bundle is LF-pinned; `git status` after the rebuild shows only your edits).
- **The coordinate frame (binding, pinned):** Revit's internal frame is millimetres, Z up. The IFC writer takes three.js **metres, Y up, the box CENTRE**: `three.x = X / 1000`, `three.y = Z / 1000`, `three.z = -Y / 1000`; `rotationY = Math.atan2(dy, dx)` for a wall from `(x0, y0)` to `(x1, y1)` (`dx = x1 - x0`, `dy = y1 - y0`), since the writer's local x axis turns toward -z for a positive rotation and `three.z = -Y`. A wall's box: `size.x` = the line's length (m), `size.y` = top − base (m), `size.z` = the thickness (m); its centre is the line's midpoint at `Z = base + (top − base) / 2`. A floor's or roof's box: the boundary's bounding rectangle (`size.x` along X, `size.z` along Y), `size.y` = its thickness, centred at the rectangle's centre and `Z = base − thickness / 2` (its top at the level); a ceiling's box hangs at `Z = base + Offset + thickness / 2` (its underside at the offset — the executor's rule). Elevations: `BaseElevation` when sent, else the level's elevation (`levelMmOf(place)`), else 0; a wall's top: `TopElevation` when sent, else base + 3000 (the add-in's sketch height, said). Thickness: `place.Thickness` (mm) when sent, else **200 mm**, said in the words.
- Never print a token or an e-mail. Never run Revit.

---

### Task 1 — Bridge: the proposal's elements (pure), the IFC, the `.frag`, the route

**Files:** modify `WebApp/src/sentinel-core/bridge-entry.ts` (add `export { buildIfc } from "./ifc-writer"; export type { BakeElement, BakeKind } from "./ifc-writer";`), rebuild `WebApp/bridge/sentinel-core.mjs`; create `WebApp/bridge/proposal-model.mjs`; modify `WebApp/bridge/bcf-service.mjs` (the changesets block, `:1778-1788`: before the `p2 && !p3 && GET` line); tests `WebApp/bridge/proposal-model.test.mjs` (new) and a route pin in `WebApp/bridge/write-roles.test.mjs` (beside its changesets pins; its fake PostgREST holds `bridge_docs` rows for store `changeset` — read `seedDoc` and the MA-3b6 preview pin for the pattern).

- [ ] **Step 1: `proposal-model.mjs`:**
```js
// MA-3d2 — the proposal model: a changeset's creates as the IFC writer's boxes, written as IFC and converted to fragments by the
// bridge's own importer (the outbox's engine). Nothing of it is a version: it is a view of what Apply would make, in the frame the
// executor places in (ChangesetExecutor: a wall's LocationCurve, base and top; a floor's Boundary at its level). Pure where it can be.
const MM = 1 / 1000;
export const SKETCH_HEIGHT_MM = 3000;   // a wall whose top the proposal did not send (the add-in's sketch height)
export const SKETCH_THICKNESS_MM = 200; // a wall or slab whose thickness the proposal did not send

/** The creates with a shape, as the writer's elements (metres, three.js Y-up, box centres) — and what was skipped, each with why. */
export function proposalElements(cs, levelMmOf = () => null) {
  const out = { elements: [], creates: 0, drawn: 0, skipped: [] };
  for (const el of cs?.elements ?? []) {
    if (el?.op !== "create" || !el.place) continue;
    out.creates++;
    const p = el.place, name = el.validate?.identity?.Name ?? el.proposal_guid ?? el.kind;
    const base = p.BaseElevation ?? levelMmOf(p) ?? 0;
    const thickMm = p.Thickness > 0 ? p.Thickness : SKETCH_THICKNESS_MM;
    if (el.kind === "wall") {
      const c = p.LocationCurve;
      if (!c?.start || !c.end || c.start.length < 2 || c.end.length < 2) { out.skipped.push(`${name}: a wall with no line`); continue; }
      const dx = c.end[0] - c.start[0], dy = c.end[1] - c.start[1], len = Math.hypot(dx, dy);
      if (len < 1) { out.skipped.push(`${name}: a wall shorter than 1 mm`); continue; }
      const top = p.TopElevation ?? base + SKETCH_HEIGHT_MM;
      if (top <= base) { out.skipped.push(`${name}: a wall whose top is not above its base`); continue; }
      const mx = (c.start[0] + c.end[0]) / 2, my = (c.start[1] + c.end[1]) / 2, mz = base + (top - base) / 2;
      out.elements.push({ kind: "wall", size: { x: len * MM, y: (top - base) * MM, z: thickMm * MM }, position: [mx * MM, mz * MM, -my * MM], rotationY: Math.atan2(dy, dx), typeName: p.TypeName ?? undefined, name });
      out.drawn++;
      continue;
    }
    if (el.kind === "floor" || el.kind === "roof" || el.kind === "ceiling") {
      const loop = (p.Boundary ?? p.LocationLoop ?? []).filter((q) => Array.isArray(q) && q.length >= 2);
      if (loop.length < 3) { out.skipped.push(`${name}: a ${el.kind} with no boundary`); continue; }
      const xs = loop.map((q) => q[0]), ys = loop.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x1 - x0 < 1 || y1 - y0 < 1) { out.skipped.push(`${name}: a ${el.kind} with no area`); continue; }
      // a floor's or roof's top sits at its level: its centre is half a thickness below; a ceiling's underside hangs at its offset above.
      const centreZ = el.kind === "ceiling" ? base + (p.Offset ?? 0) + thickMm / 2 : base - thickMm / 2;
      out.elements.push({ kind: "slab", size: { x: (x1 - x0) * MM, y: thickMm * MM, z: (y1 - y0) * MM }, position: [((x0 + x1) / 2) * MM, centreZ * MM, -((y0 + y1) / 2) * MM], rotationY: 0, typeName: p.TypeName ?? undefined, name });
      out.drawn++;
      continue;
    }
    out.skipped.push(`${name}: a ${el.kind} — not drawn (the proposal model draws walls, floors, roofs and ceilings as boxes)`);
  }
  return out;
}

/** The proposal model's bytes (.frag) and counts. deps: { buildIfc, ifcBytesToFrag } (tests inject; the defaults are the core bundle and ifc-to-frag). */
export async function proposalFrag(cs, levelMmOf, deps = {}) {
  const buildIfc = deps.buildIfc ?? (await import("./sentinel-core.mjs")).buildIfc;
  const ifcBytesToFrag = deps.ifcBytesToFrag ?? (await import("./ifc-to-frag.mjs")).ifcBytesToFrag;
  const plan = proposalElements(cs, levelMmOf);
  if (plan.drawn === 0) return { ...plan, bytes: null };
  const ifc = buildIfc(plan.elements, { projectName: `proposal · ${cs.name ?? cs.id}`, timestamp: 0 });
  const bytes = await ifcBytesToFrag(new TextEncoder().encode(ifc));
  return { ...plan, bytes };
}
```

- [ ] **Step 2: the route** — in `bcf-service.mjs`'s changesets block, before `if (p2 && !p3 && req.method === "GET")`:
```js
      // MA-3d2: the changeset's creates as a proposal model (.frag) — a member's read; nothing stored. A changeset with no create that
      // has a shape is a 409 in words. The counts ride in one header so the web says what it shows and what it skipped.
      if (p2 && p3 === "proposal.frag" && req.method === "GET") {
        const cs = await ch.getChangeset(key, p2);
        const pm = await import("./proposal-model.mjs");
        const r = await pm.proposalFrag(cs, () => null);
        if (!r.bytes) return send(res, 409, { message: `changeset ${p2} has no create with a shape to show — ${r.creates} create(s), ${r.skipped.length} skipped${r.skipped.length ? ": " + r.skipped.slice(0, 3).join("; ") : ""}` });
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-cache", "X-Sentinel-Proposal": JSON.stringify({ creates: r.creates, drawn: r.drawn, skipped: r.skipped.slice(0, 10) }), ...corsHeaders(res) });
        return res.end(Buffer.from(r.bytes));
      }
```
(`getChangeset` is the store's: 404 for an unknown id, a non-member refused by `ensureProject`. `corsHeaders(res)` is the file's helper, used by the blob GET near `:1190`. The browser must be allowed to read the header: find where `Access-Control-Expose-Headers` is set (grep `Expose-Headers` in `bcf-service.mjs`); add `X-Sentinel-Proposal` to it. The bridge does not hold the model's levels — `levelMmOf` answers null, so a create without `BaseElevation` sits at 0; the web's words say so.)

- [ ] **Step 3: tests** — `proposal-model.test.mjs`: (a) a wall `(60000,70000)→(70000,70000)`, base 0, top 3000, no thickness → one element `{ kind: "wall", size: { x: 10, y: 3, z: 0.2 }, position: [65, 1.5, -70], rotationY: 0 }` (numbers within 1e-9); (b) a wall along +Y `(0,0)→(0,4000)` → `rotationY` = π/2, `position[2]` = -2; (c) a wall with no top → `size.y` 3; (d) a floor with boundary `(0,0),(6000,0),(6000,4000),(0,4000)` at `BaseElevation 3000`, `Thickness 300` → `{ kind: "slab", size: { x: 6, y: 0.3, z: 4 }, position: [3, 2.85, -2] }`; (e) a ceiling with `Offset 2700` at base 0, no thickness → `position[1]` = 2.8; (f) a grid, a door and a retype → the grid and door skipped with the words, the retype not counted (`creates` counts creates only); (g) `proposalFrag` with injected `buildIfc` (returns a fixed string) and `ifcBytesToFrag` (returns `Uint8Array.of(1,2,3)`) → `bytes` those 3 bytes, `drawn 1`; with no drawable create → `bytes null`; (h) **the real pipeline once**: `proposalFrag` with the defaults on the (a) wall → `bytes.length > 500` (the spike's 1,917) — this loads web-ifc's wasm in Node; keep it in this file. `write-roles.test.mjs`: a viewer's `GET /changesets/demo/<id>/proposal.frag` on a seeded changeset with one wall create → 200, `content-type` octet-stream, the `X-Sentinel-Proposal` header's JSON `{ creates: 1, drawn: 1, skipped: [] }`, body length > 500; on a changeset of one retype → 409 with the words; a stranger → 403 or 404. Run both files.
- [ ] **Step 4:** `npm run build:bridge-core` (after the `bridge-entry.ts` export); `git status --short` shows `bridge/sentinel-core.mjs` modified with your edits only.
- [ ] **Step 5: commit** — `feat(bridge): MA-3d2 - GET /changesets/:key/:id/proposal.frag serves a changeset's creates as a proposal model: the IFC writer's boxes (a wall's line, base and top; a slab's boundary box, in the executor's frame) written as IFC and converted by the bridge's own importer; the counts and the skipped in one header; a member's read, nothing stored`

### Task 2 — Web: Show creates in 3D / Hide creates on the desk

**Files:** modify `WebApp/src/setups/review-desk.ts` (the storey button row from MA-3d slice 1 — `Highlight in 3D` / `Clear`; the `highlight()` helper and its dynamic imports), test `WebApp/src/setups/review-desk.test.ts`. Read first: `files-panel.ts:86-91` (`coreOf`, `modelList`), `:675-680` (`core.load(buf, { modelId })`, dispose), `clash-panel.ts:290-300` (the style and `highlightByID`), and the committed `highlight()` (how slice 1 imports `OBC`/`OBF` dynamically so vitest never loads the viewer libraries — reuse that pattern exactly).

- [ ] **Step 1: the pure words** — in `review-desk.ts`:
```ts
/** MA-3d2: the words after a storey's proposal models loaded (or not). `shown`: per changeset, the header's counts; `failed`: changesets whose model did not load, each with why. */
export function proposalWords(shown: { creates: number; drawn: number; skipped: string[] }[], failed: string[], noneToShow: boolean): string {
  if (noneToShow && !shown.length && !failed.length) return "Nothing to show: this storey proposes no create (a retype or attach changes an element that exists — Highlight in 3D selects it).";
  const creates = shown.reduce((n, s) => n + s.creates, 0), drawn = shown.reduce((n, s) => n + s.drawn, 0), skipped = shown.flatMap((s) => s.skipped);
  const head = shown.length ? `Showing ${drawn} of ${creates} proposed create(s) as a proposal model in orange — boxes from the proposal's lines and boundaries (a wall or slab whose thickness was not sent is sketched at 200 mm; a create that named only its level sits at elevation 0 here); the executor places the real shapes at Apply. Not part of any published version — Hide creates removes it.` : "";
  const skip = skipped.length ? ` Not drawn: ${skipped.slice(0, 3).join("; ")}${skipped.length > 3 ? ` (+${skipped.length - 3} more)` : ""}.` : "";
  const fail = failed.length ? ` Not loaded: ${failed.join("; ")}.` : "";
  return (head + skip + fail).trim();
}
```
- [ ] **Step 2: the panel** — beside `highlight`/`clearHighlight`:
```ts
  // MA-3d2: Show creates in 3D — each changeset's proposal model (the bridge's .frag of its creates) loaded beside what is loaded,
  // every item orange; Hide creates disposes them. Model ids "proposal:<changeset id>" — never a version's.
  const proposalId = (csId: string) => `proposal:${csId}`;
  const showCreates = async (storey: DeskStorey) => {
    const comps = opts.components;
    if (!comps) { say("Showing creates needs the viewer — not available on this page.", true); return; }
    // the same dynamic imports as highlight() — OBC, OBF, FRAGS (for RenderedFaces) and three (for Color)
    const fragments = comps.get(OBC.FragmentsManager) as unknown as { core: { load(buf: ArrayBuffer, o: { modelId: string }): Promise<unknown>; disposeModel(id: string): Promise<void>; models: { list: Map<string, unknown> } } };
    const highlighter = comps.get(OBF.Highlighter) as unknown as { styles: Map<string, unknown>; highlightByID(n: string, m: Record<string, Set<number>>, a: boolean, b: boolean): Promise<void> };
    const withCreates = storey.changesets.filter((cs) => cs.elements.some((e) => (e.op ?? "create") === "create"));
    const shown: { creates: number; drawn: number; skipped: string[] }[] = [], failed: string[] = [];
    for (const cs of withCreates) {
      try {
        const r = await bfetch(at(base, activePid(), `/${encodeURIComponent(cs.id)}/proposal.frag`));
        if (!r.ok) { failed.push(`${cs.name}: ${((await r.json().catch(() => ({ message: `HTTP ${r.status}` }))) as { message: string }).message}`); continue; }
        const counts = JSON.parse(r.headers.get("X-Sentinel-Proposal") || '{"creates":0,"drawn":0,"skipped":[]}') as { creates: number; drawn: number; skipped: string[] };
        const buf = await r.arrayBuffer();
        const id = proposalId(cs.id);
        if (fragments.core.models.list.has(id)) await fragments.core.disposeModel(id);
        await fragments.core.load(buf, { modelId: id });
        const model = fragments.core.models.list.get(id) as { getItemsIdsWithGeometry(): Promise<number[]> } | undefined;
        const ids = model ? await model.getItemsIdsWithGeometry() : [];
        if (!highlighter.styles.has("proposal")) highlighter.styles.set("proposal", { color: new THREE.Color(0xf59e0b), renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 1, transparent: false });
        if (ids.length) await highlighter.highlightByID("proposal", { [id]: new Set(ids) }, false, false);
        shown.push(counts);
      } catch (e) { failed.push(`${cs.name}: ${(e as Error).message}`); }
    }
    say(proposalWords(shown, failed, withCreates.length === 0), failed.length > 0);
  };
  const hideCreates = async (storey: DeskStorey) => {
    const comps = opts.components; if (!comps) return;
    const fragments = comps.get(OBC.FragmentsManager) as unknown as { core: { disposeModel(id: string): Promise<void>; models: { list: Map<string, unknown> } } };
    let n = 0;
    for (const cs of storey.changesets) { const id = proposalId(cs.id); if (fragments.core.models.list.has(id)) { await fragments.core.disposeModel(id); n++; } }
    say(n ? `Hid ${n} proposal model(s).` : "No proposal model is shown for this storey.");
  };
```
(`OBC`, `OBF`, `THREE`, `FRAGS` come from the same dynamic-import pattern slice 1 uses in `highlight()`; `storeyOf`, `at`, `bfetch`, `activePid` are the module's own.) In `show()`'s storey loop, the slice-1 button row gains `btn("Show creates in 3D", () => void showCreates(s))` and `btn("Hide creates", () => void hideCreates(s))`.
- [ ] **Step 3: tests** in `review-desk.test.ts`, describe `"MA-3d2 — the proposal model's words"`: `proposalWords([{ creates: 3, drawn: 2, skipped: ["D1: a door — not drawn (the proposal model draws walls, floors, roofs and ceilings as boxes)"] }], [], false)` → the exact `Showing 2 of 3 … Hide creates removes it. Not drawn: D1: a door — not drawn (…).`; two changesets' counts add up; `proposalWords([], [], true)` → the "Nothing to show" words; a failed one → `… Not loaded: <name>: <why>.`; four skipped → `(+1 more)`. Run `npx vitest run src/setups/review-desk.test.ts`; `npm run build`.
- [ ] **Step 4: commit** — `feat(web): MA-3d2 - the review desk shows a storey's creates as proposal models in the viewer (orange boxes from the bridge's proposal.frag, beside whatever is loaded) and hides them again; the words say what is drawn, what is sketched and what was skipped`

### Task 3 — Final checks (nothing to commit)
From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore the fixture if listed), `npm run build 2>&1 | tail -3`, `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). `git status --short` shows only `.claude/` and `ab.html`. Report the totals and `git log --oneline master..HEAD`.

## Live drill MA3d2 (the controller, after the build)
- P-1 (4101): `GET /changesets/ma2a-ghost/<MA3c drill A id>/proposal.frag` → 200, octet-stream, the header `{creates: 2, drawn: 2, skipped: []}`, bytes > 1 KB; a retype-only changeset → 409 words.
- W-1 (the local app, the founder's session or mine if alive): Files ▸ Open 3D on a published version of a model, Review ▸ Show creates in 3D on a storey with creates → orange boxes appear beside the model (a create placed beside an existing wall sits beside it — the frame check), Hide creates removes them — **owed to a signed-in session with a published model**.
- Merge, 1.0.55 publish, 4100 restart on master (a new route), scan, push.

## Next (out of scope here)
- Slab polygons (the writer draws boxes; a boundary's true outline needs an extruded polygon in `ifc-writer.ts`), door and window boxes on their host, the level elevations from the model (the add-in could send `place.BaseElevation` always), a proposal model per storey rather than per changeset.
