# MA-4a — evidence intake: the `evidence_pack` artefact, attestations, admit or refuse, the Holding Area, and the audit-pack rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first slice of MA-4 (design `docs/strategy/2026-09-30-model-automation-design.md` ▸ MA-4, :1121-1140; gate G2 "go MA-3, then MA-4", :1100). A project gets **one evidence pack** (`evidence_pack@n`, pack id `evp-0001`): a manifest of the office's **own scans and photos**, kept in the project's evidence folder on the office PC (D11: scans stay in the office) and **hashed in place** by the bridge. A signed-in **lead signs** the attestations (a)–(e), each once, with the pinned text's sha256 on the ledger. A **contributor admits** a file that is already in the folder: the bridge checks the path, that the file is there and not already admitted, the signatures its kind needs ((a) and (c); a photo also (d), the no-Google/Apple/Azure attestation), the format and its magic bytes and the provider, streams a sha256, writes `evidence:admitted` and folds the item into `evidence_pack@n+1`; a refusal writes `evidence:refused` with its reasons and shows in **On hold** (stage `evidence`) until the same path is admitted again or a lead dismisses it. **Re-check** re-hashes every item; a changed file is refused and flagged. The web files panel gains an **Evidence** section. Before any of it, in commits of their own, the shipped Kitemark export is renamed the **audit pack** (`GET /cde/:key/audit-pack`; the old path answers for one release), so "evidence pack" means one thing.

**Architecture:**
- `WebApp/bridge/audit-pack.mjs` (renamed from `evidence-pack.mjs`): `buildAuditPack`, `pack: "sentinel-audit-pack"`; the route answers `audit-pack` and, for one release, `evidence-pack`. `sealed()` is name-blind (it re-hashes the body), so the 2026-10-07 drill file still verifies — pinned by a test.
- `WebApp/bridge/evidence-logic.mjs` (new, pure): the five attestation texts with their sha256, `ADMIT_NEEDS {scan: ["a","c"], photo: ["a","c","d"]}`, the RED providers, the format table with magic bytes, the allowed-uses policy, `readAdmitBody`, `policyRefusals`, `magicRefusal`, `newPack`, `newItem`, `flagged`/`readmitted`, `admittedValue`, `nextId`, `validatePack`.
- `WebApp/bridge/artefact-store.mjs`: `evidence_pack` in `KINDS`; `validateArtefact` calls `validatePack`; `putArtefact` refuses the kind (MA-4a spec amendment S1); a new `foldArtefact` (the bridge's own write after a route's own role checks, version-checked, a create-only race worded as a 409); `resolveArtefact` never falls back to the office for it.
- `WebApp/bridge/evidence-store.mjs` (new, deps injected): `evidenceRoot`, `evidenceDir`, `insideFolder`, `hashFile`, and the routes' work: `makePack`, `readPack`, `signAttestation`, `runEvidenceIntake` (Governed Intake's evidence branch, on its own route — no delivery gate, IDS or upload; `POST /cde/:key/intake` and `intake-logic.mjs` stay IFC-only and untouched; the design's "Intake accepts evidence kinds" is amended to say so, Task 8), `recheckPack` (budgeted, one at a time per project).
- `WebApp/bridge/bcf-service.mjs`: the export renamed; the five evidence routes beside the intake route.
- `WebApp/bridge/cde-store.mjs`: `evidence:` / `attestation:` and the types `evidence` / `attestation` reserved on the open audit route; `readHolding` reads the `evidence` rows. `WebApp/bridge/holding-logic.mjs`: `evidenceHolds` turns them into hold timelines (no second hold row); the existing dismissal clears them.
- Web: `src/setups/audit-pack.ts` (renamed), `src/setups/evidence.ts` (new: pure words + thin calls), `files-panel.ts` (the Evidence section), `holding.ts` (stage and source `evidence`), `project-settings-panel.ts` (audit-pack words; no "Install JSON…" for `evidence_pack`).
- `WebApp/scripts/make-tiny-las.mjs` (new): the drill's small synthetic LAS.

**Tech Stack:** Node bridge (vitest; `node:crypto` streamed sha256, `node:fs` `readdirSync({recursive})` on Node 26.5), TypeScript web on That Open (plain DOM panels), the artefact store (`bridge_docs`, service-key writes since 0030). No new dependency, no migration (design :943), no add-in change (no `tools/promote-check` pins).

**Base:** `feature/ma4a-evidence-intake` at master `616dc86`. Repo root `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`. Every file:line below was read at `616dc86`. (The brief named this plan `…-evidence-intake.md`; the controller's task named this file. One plan.)

## Global Constraints

- House style: words are sentences; a refusal says what is needed and who you are, and ends "nothing was saved"; comments name the slice ("MA-4a") and the reason; exact words pinned in tests. No new dependency. No migration. No add-in change. The web bump (1.0.62) is the controller's at the merge.
- Commit messages `feat(bridge|web): MA-4a - …` or `refactor(bridge|web): MA-4a - …`, a blank line, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only on `feature/ma4a-evidence-intake`. The audit-pack rename is Tasks 1 and 2, two commits of their own, before any evidence code.
- Tests: `npx vitest run <files>` from `WebApp`; never a bare `node bridge/bcf-service.mjs`. The full suite is the final checks'. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json` if it shows as modified (line endings); leave `WebApp/package-lock.json` as you found it (it was modified before this branch — never stage it). `npm run build` must build; `tsc` is not a gate (17 pre-existing errors; no new one).
- The repo is PUBLIC: fixtures use `example.test`; no path with a real user name in a test or a doc (the tests use temp folders).
- **The trust rule (binding):** `storage_root`, an attestation's `by`/`role`/`at`/`text_sha256`, `admitted_by`, `admitted_at`, `registration.confirmed_by`, `report_sha256`, `sha256`, `size_bytes`, `surveyable`, `allowed_uses`, `provider`, `licence` and `attestation_ids` are set by the bridge from `resolveActor` / `myRole` / its own hashing (design :166; the `installed_by` precedent, `artefact-store.mjs:356-358`). A body sends only `{path, kind, provider?, registration?: {method, report_path?}}` to admit, `{code}` to sign, `{asset?}` to make.
- **No evidence bytes leave the PC:** the evidence routes take small JSON (`readBody(req, { max: SMALL_JSON })`), hash files where they lie (`createReadStream`), and call nothing remote. No `readRaw`, `/cde/files`, Supabase storage or That Open for evidence (E-7; pinned offline in Task 5).
- Never print a token or an e-mail. Never run Revit. No download, no install.

## Source of truth

- Design (D): §6.2 the manifest (:634-669); §6.5 ledger rows (:825-827); §6.7 kinds (:861); §6.8 routes (:869-872, :886) and roles (:944-951); D11 storage (:629-632, :937-940); D17 roles; MA-4 (:1121-1140).
- Research (R, `docs/research/2026-09-30-reality-to-model.md`): attestations (:247-252, (a) at :248), the RED sources (:207), item fields (:233-239, :338-367).
- The architect's brief of 2026-10-08 (this plan's slice MA-4a and the decisions below).

## Decisions (the founder's defaults; built on unless overruled)

| # | Decision | Default taken here |
|---|---|---|
| 1 | Wording of (a), whose sha goes on the ledger | R:248 — "I am the owner, or authorised by the owner, of this asset." (D:950 is shorthand; amended in Task 8) |
| 2 | Who signs (a)–(e) | A signed-in lead (or owner) for all five (D17); the machine credential never signs |
| 3 | Where evidence lives | `SENTINEL_EVIDENCE_ROOT`, default `%APPDATA%/Sentinel/evidence`, then `/<project key>`; the NAS later by env, no code change (the pack's `storage_root` is re-stamped on every write) |
| 4 | RCP | Admitted with its registration report (hashed), `surveyable: false` (no ReCap on the PC) |
| 5 | Open3D | Dropped from sentinel-survey v0.1 (MA-4c/4g) — not this slice |
| 6 | The bridge running Python | MA-4c — not this slice |
| 7 | Kladno download | Asked at MA-4h — not this slice |
| 8 | Wall F1 reference | MA-4h — not this slice |
| 9 | Overlay budget | MA-4f — not this slice |
| 10 | Ask-the-owner letter | MA-4b — not this slice |
| 11 | Scan tiles leaving the office | MA-4i — not this slice |
| 12 | MA-4a spec amendment S1 | A `PUT` of `evidence_pack` is refused; items change only through the evidence routes; one pack per project (`evp-0001`), on a project — never on an office row; amend D:869-871 and D:886 |
| 12b | MA-4a spec amendment S2 | A refused item is held in the Holding Area at stage `evidence` (read from its own `evidence:refused` row) until the same path is admitted or a lead dismisses it; the design's "gaps go to the Holding Area as groups" stays MA-4d's |
| 12c | Who admits | A signed-in contributor or above of an office project: an admission names who admitted the file and who confirmed its registration, so the machine credential is a 403 (as for attestations). Re-check is the machine's too (it claims nothing; its rows say `machine`) |
| 13 | The name clash | The Kitemark export becomes the **audit pack** in this slice; `GET /cde/:key/evidence-pack` keeps answering until web 1.0.62 is published (one release) |
| — | Admission needs | By kind: a scan (a) and (c), a photo (a), (c) and (d) signed first (D:486: the RED rule is attested, since a provider field can be left out); an item's `attestation_ids` are the codes its kind needed; `allowed_uses` `{view_reference: true, geometry_extraction: true, texture_embed: false, redistribute: false, ml_training: false}`, the two policy fields forced false; no browser upload; item cap 100 (every admission writes a whole new pack version, so stored size grows with the square of the items — see Risks); no new table |

## Scope

In: the audit-pack rename; the `evidence_pack` kind (project only, manifest only); attestations (a)–(e); admission of own scans (`e57`, `las`, `laz`, `rcp`) and own photos (`jpg`, `png`) from the project's evidence folder; refusals with reasons; Re-check; the Holding Area's stage `evidence`; the Evidence section on the web; reserved ledger prefixes; the drill script.

Out (later slices, see Next): drawings, Ask the owner, `request_id` and the use of (b) (MA-4b); web, AMBER and dataset items, `delete_by`, `evidence:expired` (MA-7, except the Kladno dataset path in MA-4h); the survey, jobs and `build:run` (MA-4c); changeset evidence-id checks and NOTICE (MA-4d); overlays and web tiles (MA-4f, MA-4i); background hashing for multi-GB files (MA-4h).

## File map

| File | Change |
|---|---|
| `WebApp/bridge/evidence-pack.mjs` → `audit-pack.mjs` | `git mv`; `buildAuditPack`; `pack: "sentinel-audit-pack"` |
| `WebApp/bridge/evidence-pack.test.mjs` → `audit-pack.test.mjs` | `git mv`; renamed names; an old-name `sealed()` pin |
| `WebApp/bridge/bcf-service.mjs` | `:1432-1450` the export renamed, both paths; `:1591` comment; new evidence routes before `:1668` |
| `WebApp/bridge/write-roles.test.mjs` | `:952-965` renamed + old path; a new `describe` for the evidence routes |
| `WebApp/src/setups/evidence-pack.ts` → `audit-pack.ts`, `.test.ts` likewise | `git mv`; the default file name |
| `WebApp/src/setups/project-settings-panel.ts` | `:11` import; `:293` no Install JSON for `evidence_pack`; `:296-314` audit-pack words and id |
| `WebApp/bridge/evidence-logic.mjs`, `.test.mjs` | new (pure) |
| `WebApp/bridge/artefact-store.mjs` | `:13` KINDS; `:337` validator branch; `:345-365` PUT refusal + `installVersion` + `foldArtefact`; `:397-411` project only |
| `WebApp/bridge/artefact-store.test.mjs` | `:7` import; a new `describe` |
| `WebApp/bridge/artefact-import.mjs` | `:2`, `:60` help text |
| `WebApp/bridge/evidence-store.mjs`, `.test.mjs` | new |
| `WebApp/bridge/cde-store.mjs` | `:1200-1201` reserved; `:1481-1502` readHolding |
| `WebApp/bridge/ledger-write.test.mjs` | four reserved rows in the `it.each` at `:58-83` |
| `WebApp/bridge/holding-logic.mjs`, `.test.mjs` | `:10` REFUSAL; `evidenceHolds` |
| `WebApp/bridge/cde-store-holding.test.mjs` | a new `describe` |
| `WebApp/src/setups/holding.ts`, `holding.test.ts` | `:10-11`, `:53-54`, `:167-171` |
| `WebApp/src/setups/evidence.ts`, `evidence.test.ts` | new |
| `WebApp/src/setups/files-panel.ts` | imports; state `:74`; load `:188-189`, the catch `:198` (its reset line `:201`); render `:238`; wiring after `:259`; the section beside `gapSection` |
| `WebApp/scripts/make-tiny-las.mjs` | new (drill data) |
| `ROADMAP.md`, `docs/compliance/INFORMATION_MANAGEMENT_PROCEDURE.md`, `docs/compliance/CERTIFICATION_READINESS_2026-10.md`, `docs/strategy/2026-09-30-model-automation-design.md` | the rename lines; §6.2 sentences; MA-4a S1/S2 amendments; the MA-4 "Intake accepts evidence kinds" line; the (a) wording and signer |

---

### Task 1 — Bridge: the Kitemark export becomes the audit pack (its own commit)

**Files:** `git mv WebApp/bridge/evidence-pack.mjs WebApp/bridge/audit-pack.mjs`, `git mv WebApp/bridge/evidence-pack.test.mjs WebApp/bridge/audit-pack.test.mjs`; modify `WebApp/bridge/bcf-service.mjs:1432-1450`, `WebApp/bridge/write-roles.test.mjs:952-965`.

- [ ] **Step 1: `audit-pack.mjs`** — line 1 comment: `// Paperwork slice 5 (docs/compliance/CERTIFICATION_READINESS_2026-10.md §3), renamed the audit pack in MA-4a (the evidence pack is now MA-4's evidence_pack artefact): one export per project — the Kitemark audit's day-one`. Rename `export async function buildEvidencePack(key, deps)` → `export async function buildAuditPack(key, deps)` (`:27`) and `pack: "sentinel-evidence-pack"` → `pack: "sentinel-audit-pack"` (`:56`; keep `version: 1`). Above `sealed` (`:19`) add:
```js
/** MA-4a: name-blind on purpose — a pack saved under its pre-MA-4a name (the 2026-10-07 drill file) still verifies. */
```
- [ ] **Step 2: the route** — replace `bcf-service.mjs:1432-1450` with:
```js
      // Paperwork slice 5, renamed in MA-4a: GET /cde/:key/audit-pack → the project's audit pack (a lead's or an owner's; the machine
      // credential as service): standards in force, documents, containers and versions, review chains, the ledger with its hashes,
      // sealed by sha256. "evidence-pack" is the same export under its old name.
      // ponytail: the old path answers for one release, so web 1.0.61's button does not 404 — drop it after 1.0.62 is published.
      if ((p2 === "audit-pack" || p2 === "evidence-pack") && !p3 && req.method === "GET") {
        const members = await import("./members-store.mjs");
        await members.requireMinRole(p1, "lead");
        const art = await import("./artefact-store.mjs");
        const bimdocs = await import("./bimdocs-store.mjs");
        const ap = await import("./audit-pack.mjs");
        const pack = await ap.buildAuditPack(p1, {
```
(the deps object `:1441-1447` unchanged) and the reply `:1449` file name `…-audit-pack-${pack.generated_at.slice(0, 10)}.json`.
- [ ] **Step 3: tests** — `audit-pack.test.mjs`: line 1 `// Paperwork slice 5 — the audit pack (renamed in MA-4a): canonical bytes, the seal, honest partial parts, the ledger paging.`; import `buildAuditPack` from `./audit-pack.mjs`; `describe("buildAuditPack", …)`; `:27` expects `pack: "sentinel-audit-pack"`. Add to the `canonical + seal` describe:
```js
  it("MA-4a: a pack sealed under the old name still verifies (sealed() re-hashes the body; the name is not checked)", () => {
    const old = seal({ pack: "sentinel-evidence-pack", version: 1, generated_at: "2026-10-07T18:00:00.000Z", ledger: { rows: [] } });
    expect(sealed(old)).toBe(true);
    expect(sealed({ ...old, pack: "sentinel-audit-pack" })).toBe(false);
  });
```
`write-roles.test.mjs:952-965` → `describe("audit pack (paperwork slice 5; renamed in MA-4a)", …)`; `get` takes `(as, path = "audit-pack")` and fetches `/cde/demo/${path}`; the disposition is `/^attachment; filename="demo-audit-pack-\d{4}-\d{2}-\d{2}\.json"$/`; the body `pack: "sentinel-audit-pack"`. Add:
```js
  it("the old path answers for one release (web 1.0.61's button) with the same export", async () => {
    const r = await get("lead", "evidence-pack");
    expect(r.status).toBe(200); expect(r.body.pack).toBe("sentinel-audit-pack");
    expect(r.disposition).toMatch(/filename="demo-audit-pack-/);
    expect((await get("viewer", "evidence-pack")).status).toBe(403);
  });
```
Run `npx vitest run bridge/audit-pack.test.mjs bridge/write-roles.test.mjs`.
- [ ] **Step 4: commit** — `refactor(bridge): MA-4a - the Kitemark export is the audit pack (GET /cde/:key/audit-pack, sentinel-audit-pack, <key>-audit-pack-<day>.json); the old path answers for one release; sealed() still verifies a pack saved under the old name`

### Task 2 — Web: Download audit pack (its own commit)

**Files:** `git mv WebApp/src/setups/evidence-pack.ts WebApp/src/setups/audit-pack.ts`, `git mv WebApp/src/setups/evidence-pack.test.ts WebApp/src/setups/audit-pack.test.ts`; modify `WebApp/src/setups/project-settings-panel.ts:11, :296-314`.

- [ ] **Step 1:** `audit-pack.ts` line 1: `// Paperwork slice 5, the web half (renamed the audit pack in MA-4a): a lead downloads the project's audit pack (GET /cde/:key/audit-pack, the bridge's sealed`; `packFilename`'s fallback becomes `` `${key.replace(/[^A-Za-z0-9_-]/g, "_")}-audit-pack-${day}.json` ``. `packWords` unchanged.
- [ ] **Step 2:** `project-settings-panel.ts:11` → `import { packFilename, packWords, saveAs } from "./audit-pack";`. `:296-314`:
```ts
      // Paperwork slice 5 (the audit pack since MA-4a): the Kitemark audit's day-one file — a lead's or an owner's to download.
      if (canGovernRole(role)) {
        host.insertAdjacentHTML("beforeend",
          `<div style="display:flex;align-items:center;gap:.6rem;padding:.35rem 0;font-size:12px">` +
          `<span style="width:6.5rem;color:#9ca3af">audit pack</span>` +
          `<span style="flex:1;color:#71717a;font-size:11px">the standards in force, the documents, the containers and versions, the review chains and every ledger row with its hash — one JSON, sealed by sha256</span>` +
          `<button id="ps-audit-pack" style="${btn};padding:.2rem .5rem;font-size:11px">Download audit pack</button></div>`);
        const b = host.querySelector<HTMLButtonElement>("#ps-audit-pack")!;
```
the fetch `` `${base}/cde/${encodeURIComponent(key)}/audit-pack` ``, and the catch `` `Audit pack not read — ${(e as Error)?.message ?? String(e)}` ``. The rest unchanged.
- [ ] **Step 3: tests** — `audit-pack.test.ts`: import from `./audit-pack`; `describe("audit pack (web)", …)`; `packFilename('attachment; filename="aster-tower-audit-pack-2026-10-08.json"', "x")` → `"aster-tower-audit-pack-2026-10-08.json"`; `packFilename(null, "a b/c", "2026-10-08")` → `"a_b_c-audit-pack-2026-10-08.json"`. Run `npx vitest run src/setups/audit-pack.test.ts`; `npm run build`; `grep -rn "evidence-pack\|ps-evidence" src` → nothing.
- [ ] **Step 4: commit** — `refactor(web): MA-4a - Download audit pack (GET /cde/:key/audit-pack); the file is <key>-audit-pack-<day>.json`

### Task 3 — Bridge: the pure evidence rules

**Files:** create `WebApp/bridge/evidence-logic.mjs`, `WebApp/bridge/evidence-logic.test.mjs`.

- [ ] **Step 1: `evidence-logic.mjs`:**
```js
// MA-4a — evidence intake's pure rules (design §6.2; R2M §4.5-§6.3): the five attestation texts pinned with their sha256, the RED
// providers, the format table with its magic bytes, the allowed-uses policy, the admit body's shape and the pack's validator. No IO:
// evidence-store.mjs does the reading and hashing; artefact-store.mjs calls validatePack on every evidence_pack@n it writes.
import { createHash } from "node:crypto";

const err = (status, message) => Object.assign(new Error(message), { status });
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** The texts exactly as signed. Each signature puts its text's sha256 on the ledger, so a word changed here is a different
 *  attestation — evidence-logic.test.mjs pins the five hashes. (a) is R2M's wording (R:248, the founder's default; D:950 is shorthand). */
const TEXTS = {
  a: "I am the owner, or authorised by the owner, of this asset.",
  b: "I have the copyright holder's permission for these drawings.",
  c: "These are my own photos and scans. People have consented, or their faces are blurred.",
  d: "None of these images are captures from Google, Apple or Azure/Bing map services.",
  e: "Our commercial licence covers this use and this deliverable.",
};
export const ATTESTATIONS = Object.fromEntries(Object.entries(TEXTS).map(([code, text]) => [code, { text, sha256: createHash("sha256").update(text, "utf8").digest("hex") }]));
/** Signed before an item of that kind is admitted: the owner's authority (a) and own capture (c); a photo also (d), that it is no
 *  Google/Apple/Azure capture — the RED rule (D:486) rests on the attestation, since a body may leave `provider` out. */
export const ADMIT_NEEDS = { scan: ["a", "c"], photo: ["a", "c", "d"] };
/** "(a)", "(a) and (c)", "(a), (c) and (d)". */
export const codesSaid = (codes) => codes.map((c) => `(${c})`).join(", ").replace(/, ([^,]*)$/, " and $1");
/** RED sources (R:207, D:486): never admitted, whoever attests. Matched inside the provider's name, case ignored. */
export const RED = ["google", "apple", "bing", "azure"];
export const PACK_ID = "evp-0001";          // one pack per project in MA-4 (MA-4a spec amendment S1)
// ponytail: every admission, signature and flag writes a whole new evidence_pack@n+1 (kept forever), so stored size grows with the
// square of the items — 100 items ≈ 5,050 item copies ≈ 3 MB of jsonb. Upgrade path before raising it: a pack of item refs (one doc
// per item, the pack holding ids and shas) — MA-4h's Kladno pack is the first that needs more.
export const MAX_ITEMS = 100;
/** The format table: what is admitted, as which kind, and the bytes it begins with (hex; null = by extension only). An RCP cannot be
 *  read here without ReCap: admitted with its registration report, never surveyed (decision 4). */
export const FORMATS = {
  e57: { kind: "scan", magic: "4153544d2d453537", surveyable: true },        // "ASTM-E57"
  las: { kind: "scan", magic: "4c415346", surveyable: true },                // "LASF"
  laz: { kind: "scan", magic: "4c415346", surveyable: true },                // "LASF" (compressed points; read from MA-4g)
  // ponytail: RCP is checked by extension only (a ReCap project is a folder index with no fixed magic here); a real one waits for an
  // owner's scan — until then any bytes named .rcp are admitted with their report.
  rcp: { kind: "scan", magic: null, surveyable: false },
  jpg: { kind: "photo", magic: "ffd8ff", surveyable: true },
  png: { kind: "photo", magic: "89504e470d0a1a0a", surveyable: true },
};
/** The uses an own item allows. texture_embed and redistribute are always false, by policy (D:668). */
export const USES = { view_reference: true, geometry_extraction: true, texture_embed: false, redistribute: false, ml_training: false };
const PACK_FIELDS = ["kind", "pack_id", "project", "asset", "storage_root", "attestations", "items"];

/** A path relative to the evidence folder, written with "/": no ":" anywhere (a drive, or an NTFS alternate stream "a.jpg:x.las" the
 *  folder list never shows), no leading slash, no "", "." or ".." segment. */
export const safeRel = (p) => typeof p === "string" && p.length >= 1 && p.length <= 400 && !p.includes("\0") && !p.includes(":")
  && !p.split("/").some((s) => s === "" || s === "." || s === "..");
export const extOf = (p) => (/\.([A-Za-z0-9]+)$/.exec(String(p))?.[1] ?? "").toLowerCase();
/** The table's format for a path (".jpeg" is jpg), or null. */
export const formatOf = (p) => { const e = extOf(p) === "jpeg" ? "jpg" : extOf(p); return FORMATS[e] ? e : null; };

/** POST …/items' body → {path, kind, provider, registration}, or a 400 in words before anything is read or written. Shape only: what a
 *  NEW item must carry (a scan's method, an RCP's report) is newItemRefusal's — a flagged item is admitted again as first admitted. */
export function readAdmitBody(b = {}) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  const path = typeof b.path === "string" ? b.path.trim().replace(/\\/g, "/") : "";
  if (!safeRel(path)) throw bad("path must name a file inside the project's evidence folder, relative to it (no drive, no leading slash, no ..)");
  if (!["scan", "photo", "drawing"].includes(b.kind)) throw bad("kind must be scan or photo");
  const provider = b.provider == null ? "own" : String(b.provider).trim().toLowerCase();
  if (!provider || provider.length > 100) throw bad("provider must be a name of at most 100 characters (own when left out)");
  if (b.registration != null && !isObj(b.registration)) throw bad("registration must be an object {method, report_path?}");
  let registration = null;
  if (b.kind === "scan" && b.registration != null) {
    const method = typeof b.registration.method === "string" ? b.registration.method.trim() : "";
    if (method.length > 300) throw bad("registration.method must be at most 300 characters");
    const rp = b.registration.report_path == null ? null : String(b.registration.report_path).trim().replace(/\\/g, "/");
    if (rp !== null && !safeRel(rp)) throw bad("registration.report_path must name a file inside the project's evidence folder, relative to it");
    registration = { method, report_path: rp };
  }
  return { path, kind: b.kind, provider, registration };
}

/** What a new item (not a flagged one coming back) must carry, as a 400's words, or null. */
export function newItemRefusal({ path, kind, registration }) {
  if (kind !== "scan") return null;
  if (!registration?.method) return 'a scan names how it was registered: registration.method, for example "registered in source" (at most 300 characters) — nothing was saved';
  if (formatOf(path) === "rcp" && !registration.report_path) return "an RCP is admitted with its registration report: registration.report_path, a file in the evidence folder — nothing was saved";
  return null;
}

/** The reasons an item is refused before its bytes are read (each becomes an evidence:refused row). [] = none. */
export function policyRefusals({ kind, provider, path }) {
  const out = [];
  if (RED.some((r) => provider.includes(r))) out.push(`${provider} is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)`);
  else if (provider !== "own") out.push("web and third-party items wait for a later stage — only your own scans and photos (provider own) are admitted now");
  if (kind === "drawing") { out.push("drawings come through Ask the owner (MA-4b)"); return out; }
  const f = formatOf(path);
  if (!f) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted — scans are e57, las, laz or rcp; photos are jpg or png`);
  else if (FORMATS[f].kind !== kind) out.push(`a .${f} is a ${FORMATS[f].kind}, not a ${kind}`);
  return out;
}

/** null when the file's first bytes are the format's; else the refusal's words. `head`: a Buffer of the first 8 bytes. */
export function magicRefusal(format, head) {
  const m = FORMATS[format]?.magic;
  return !m || head.toString("hex").startsWith(m) ? null : `the file does not begin as a .${format} does — renamed or damaged`;
}

export const missingAttestations = (pack, codes) => codes.filter((c) => !pack.attestations.some((a) => a.code === c));
/** The next id of a list: "ev-0001", "att-0003" — one past the highest number used. */
export const nextId = (prefix, list) => `${prefix}-${String(list.reduce((n, x) => Math.max(n, Number(String(x.id).split("-")[1]) || 0), 0) + 1).padStart(4, "0")}`;

/** A new pack for `key` — no attestation, no item; the bridge stamps storage_root. */
export function newPack(key, projectName, asset, storageRoot) {
  const a = isObj(asset) ? asset : {};
  const s = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { kind: "evidence_pack", pack_id: PACK_ID, project: key, asset: { name: s(a.name) ?? projectName ?? key, type: s(a.type), jurisdiction: s(a.jurisdiction), crs: s(a.crs) }, storage_root: storageRoot, attestations: [], items: [] };
}

/** An admitted own item; every field from the bridge (the trust rule). `report`: {sha256} of the registration report, or null. */
export function newItem({ id, input, format, sha256, size_bytes, report, pack, who, at }) {
  const reg = input.registration;
  return {
    id, kind: input.kind, format, sha256, size_bytes, path: input.path, provider: "own", licence: "owner-supplied",
    attestation_ids: ADMIT_NEEDS[input.kind].map((c) => pack.attestations.find((a) => a.code === c).id), // a photo's names (d) too
    allowed_uses: { ...USES },
    ...(reg ? { registration: { method: reg.method, ...(reg.report_path ? { report_path: reg.report_path, report_sha256: report.sha256 } : {}), confirmed_by: who } } : {}),
    surveyable: FORMATS[format].surveyable, admitted_by: who, admitted_at: at,
  };
}
/** An item whose file no longer matches: refused and flagged until the same file is admitted again. A re-scan goes in under a new
 *  path; retiring a flagged item waits for MA-7 (Next). */
export const flagged = (i, sha256, at) => ({ ...i, state: "changed", changed_sha256: sha256, changed_at: at });
export function readmitted(i) { const { state: _s, changed_sha256: _c, changed_at: _a, ...rest } = i; return rest; }
/** The evidence:admitted row's new_value. */
export const admittedValue = (packId, i, packVersion, again) => ({
  pack_id: packId, item_id: i.id, path: i.path, sha256: i.sha256, size_bytes: i.size_bytes, kind: i.kind, format: i.format,
  provider: i.provider, licence: i.licence, allowed_uses: i.allowed_uses, attestation_ids: i.attestation_ids, surveyable: i.surveyable,
  pack_version: packVersion, ...(again ? { readmitted: true } : {}),
});

/** validateArtefact's branch for evidence_pack: a 400 naming the path, so the bridge never writes a pack it could not trust. */
export function validatePack(p) {
  const bad = (path, want) => err(400, `evidence_pack: ${path} ${want}`);
  const stray = Object.keys(p).find((k) => !PACK_FIELDS.includes(k));
  if (stray !== undefined) throw bad(stray, "is not a pack field — {kind, pack_id, project, asset, storage_root, attestations, items}");
  if (p.kind !== "evidence_pack") throw bad("kind", 'must be "evidence_pack"');
  if (p.pack_id !== PACK_ID) throw bad("pack_id", `must be ${PACK_ID} (one pack per project)`);
  if (!str(p.project, 128)) throw bad("project", "must be the project key");
  if (!isObj(p.asset) || !str(p.asset.name, 200)) throw bad("asset.name", "must be a non-empty string of at most 200 characters");
  for (const k of ["type", "jurisdiction", "crs"]) if (p.asset[k] != null && !str(p.asset[k], 100)) throw bad(`asset.${k}`, "must be a string of at most 100 characters, or null");
  if (!str(p.storage_root, 1000)) throw bad("storage_root", "must be the evidence folder's path");
  if (!Array.isArray(p.attestations) || p.attestations.length > 5) throw bad("attestations", "must be an array of at most 5 (a to e, once each)");
  const attIds = new Map(), codes = new Set(); // id → code
  p.attestations.forEach((a, i) => {
    const at = `attestations[${i}]`;
    if (!isObj(a)) throw bad(at, "must be an object");
    if (!/^att-\d{4}$/.test(a.id) || attIds.has(a.id)) throw bad(`${at}.id`, "must be a unique att-NNNN");
    if (!ATTESTATIONS[a.code] || codes.has(a.code)) throw bad(`${at}.code`, "must be one of a to e, once per pack");
    if (a.text_sha256 !== ATTESTATIONS[a.code].sha256) throw bad(`${at}.text_sha256`, `must be the sha256 of (${a.code})'s pinned text`);
    if (!str(a.by, 320) || !["lead", "owner"].includes(a.role) || !str(a.at, 40)) throw bad(at, "needs by, role (lead or owner) and at — stamped by the bridge");
    attIds.set(a.id, a.code); codes.add(a.code);
  });
  if (!Array.isArray(p.items) || p.items.length > MAX_ITEMS) throw bad("items", `must be an array of at most ${MAX_ITEMS}`);
  const ids = new Set(), paths = new Set();
  p.items.forEach((x, i) => {
    const at = `items[${i}]`;
    if (!isObj(x)) throw bad(at, "must be an object");
    if (!/^ev-\d{4}$/.test(x.id) || ids.has(x.id)) throw bad(`${at}.id`, "must be a unique ev-NNNN");
    if (!safeRel(x.path) || paths.has(x.path)) throw bad(`${at}.path`, "must be a unique path inside the evidence folder");
    const f = FORMATS[x.format];
    if (!f || f.kind !== x.kind) throw bad(`${at}.format`, "must be in the format table for its kind (scan: e57, las, laz, rcp; photo: jpg, png)");
    if (!/^[0-9a-f]{64}$/.test(x.sha256)) throw bad(`${at}.sha256`, "must be 64 hex");
    if (!Number.isSafeInteger(x.size_bytes) || x.size_bytes < 0) throw bad(`${at}.size_bytes`, "must be a whole number of bytes");
    if (x.provider !== "own" || x.licence !== "owner-supplied") throw bad(at, "is own (licence owner-supplied) — MA-4a admits nothing else");
    if (!Array.isArray(x.attestation_ids) || !x.attestation_ids.every((a) => attIds.has(a))
      || !ADMIT_NEEDS[x.kind].every((c) => x.attestation_ids.some((a) => attIds.get(a) === c)))
      throw bad(`${at}.attestation_ids`, `must name attestations of this pack, ${codesSaid(ADMIT_NEEDS[x.kind])} at least for a ${x.kind}`);
    const u = x.allowed_uses;
    if (!isObj(u) || Object.keys(u).length !== Object.keys(USES).length || Object.keys(USES).some((k) => typeof u[k] !== "boolean")) throw bad(`${at}.allowed_uses`, `must be exactly {${Object.keys(USES).join(", ")}}, each true or false`);
    if (u.texture_embed !== false || u.redistribute !== false) throw bad(`${at}.allowed_uses`, "texture_embed and redistribute are always false (policy)");
    if (x.kind === "scan" && !(isObj(x.registration) && str(x.registration.method, 300) && str(x.registration.confirmed_by, 320))) throw bad(`${at}.registration`, "a scan carries {method, confirmed_by}");
    if (x.format === "rcp" && !(safeRel(x.registration.report_path) && /^[0-9a-f]{64}$/.test(x.registration.report_sha256 ?? ""))) throw bad(`${at}.registration`, "an RCP carries its report's path and sha256");
    if (x.surveyable !== f.surveyable) throw bad(`${at}.surveyable`, `must be ${f.surveyable} for a .${x.format}`);
    if (!str(x.admitted_by, 320) || !str(x.admitted_at, 40)) throw bad(at, "needs admitted_by and admitted_at — stamped by the bridge");
    if (x.state !== undefined && x.state !== "changed") throw bad(`${at}.state`, 'is "changed" or absent');
    ids.add(x.id); paths.add(x.path);
  });
  return true;
}
```
- [ ] **Step 2: tests** — `evidence-logic.test.mjs` (header: `// MA-4a — the evidence rules, pure: the pinned texts, the body, the policy, the magic bytes, the validator.`):
  (a) the five hashes exactly: `{ a: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546", b: "a66c8e127c1f8e7217ad943f30db0dff7f9f9f025a6fc9c7a0c64afcb9288c92", c: "f6103bd87d440564df63796758df64fb7a0e9077aa766559a6b18f1cad041bbc", d: "6b4631aec9b8969a9129837fe830943418c6d1a0bc580f3f3336347592920f4a", e: "71656072b4e5b61196fcacd3fdf1d3f5b5ca19043cfe124159dca0cc788bc217" }` and `ATTESTATIONS.a.text` the R:248 sentence;
  (b) `readAdmitBody`: `"../x"`, `"/x"`, `"C:/x"`, `"a//b"`, `"./a"`, `"photos/a.jpg:x.las"` → `{ status: 400, message: "path must name a file inside the project's evidence folder, relative to it (no drive, no leading slash, no ..) — nothing was saved" }`; `"scans\\a.las"` → path `"scans/a.las"`; a scan with no `registration` → `registration: null` (no 400 here); `provider` left out → `"own"`; `"Google Maps"` → `"google maps"`; `kind: "dataset"` → `"kind must be scan or photo — nothing was saved"`. `newItemRefusal`: a scan with no method → the words with `registration.method`; `"site.rcp"` with a method and no report → the RCP words; a photo → null. `codesSaid(["a","c","d"])` → `"(a), (c) and (d)"`, `codesSaid(["d"])` → `"(d)"`; `ADMIT_NEEDS` equals `{ scan: ["a", "c"], photo: ["a", "c", "d"] }`;
  (c) `policyRefusals`: `{kind:"photo", provider:"google maps", path:"a.jpg"}` → `["google maps is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]`; `"azure"` likewise; `"wikimedia-commons"` → the later-stage words; `{kind:"drawing", provider:"own", path:"A-101.pdf"}` → `["drawings come through Ask the owner (MA-4b)"]`; `a.txt` as photo → `["a .txt is not admitted — scans are e57, las, laz or rcp; photos are jpg or png"]`; `a.jpg` as scan → `["a .jpg is a photo, not a scan"]`; `{photo, own, a.JPEG}` → `[]`;
  (d) `magicRefusal`: `"las"`/`"laz"` with `Buffer.from("LASF\0\0\0\0")` → null; `"e57"` with `Buffer.from("ASTM-E57")` → null; `"jpg"` with `Buffer.from([0xff,0xd8,0xff,0xe0])` → null; `"png"` with the 8 PNG bytes → null; `"las"` with `Buffer.from("PK\x03\x04")` → `"the file does not begin as a .las does — renamed or damaged"`; `"rcp"` with anything → null;
  (e) `nextId("ev", [])` → `"ev-0001"`, after `ev-0009` → `"ev-0010"`;
  (f) `validatePack(newPack("p", "P", {}, "C:/ev/p"))` → true; an item with `allowed_uses.texture_embed: true` → 400 `"evidence_pack: items[0].allowed_uses texture_embed and redistribute are always false (policy)"`; an item whose `attestation_ids` names `att-0009` → 400 `items[0].attestation_ids`; an attestation with a wrong `text_sha256` → 400; a stray top-level `note` → 400; `MAX_ITEMS` is 100 (pinned) and 101 items → 400 `"evidence_pack: items must be an array of at most 100"`; a scan item from `newItem` (with (a),(c) signed) passes with `attestation_ids` of (a) and (c); a photo item from `newItem` (with (a),(c),(d) signed) carries three ids and passes; that photo with (d)'s id removed → 400 `"evidence_pack: items[0].attestation_ids must name attestations of this pack, (a), (c) and (d) at least for a photo"`; and `readmitted(flagged(item, null, "t"))` equals the item.
  Run `npx vitest run bridge/evidence-logic.test.mjs`.
- [ ] **Step 3: commit** — `feat(bridge): MA-4a - evidence intake's pure rules: the five attestation texts pinned with their sha256, the RED providers, the format table with magic bytes, the allowed-uses policy, the admit body and the pack validator`

### Task 4 — Bridge: `evidence_pack` in the artefact store (project only, never a hand PUT, folded by the bridge)

**Files:** modify `WebApp/bridge/artefact-store.mjs`, `WebApp/bridge/artefact-import.mjs:2,60`; test `WebApp/bridge/artefact-store.test.mjs` (import line `:7`; `memDeps` at `:18-33` is reused).

- [ ] **Step 1:** `:10` add `import { validatePack } from "./evidence-logic.mjs"; // MA-4a: the evidence_pack validator (pure, no cycle)`. `:13` KINDS gains `"evidence_pack"` at the end. Before `return true;` at `:337`:
```js
  if (kind === "evidence_pack") {
    // MA-4a (design §6.2): the manifest only — the files stay in the project's evidence folder. Every write is the bridge's own fold.
    validatePack(body);
  }
```
- [ ] **Step 2:** replace `putArtefact` (`:345-365`) with:
```js
// MA-4a: two writes of one kind at once meet docInsert's create-only kind@n (the database's 409, or a test double's).
const RACE = (kind) => `another change to ${kind} landed at the same moment — read it again and retry; nothing was saved`;
const PROJECT_ONLY = ["evidence_pack"]; // MA-4a: a project never inherits its office's evidence

/** kind@n+1, the pointer and the artefact_installed row — putArtefact's and foldArtefact's one writer. */
async function installVersion(d, proj, kind, body, prev, { actor, source }) {
  const version = (prev?.version || 0) + 1;
  const pointer = {
    kind, version, sha256: sha256(body),
    // Shown in Settings as who installed the standard, and carried into the ledger row's new_value: the signed-in lead's
    // verified identity, never ?actor or body.installed_by (cde-13). The machine credential keeps its label.
    installed_by: resolveActor(actor, "web"), installed_at: new Date().toISOString(),
    source: source && typeof source === "object" ? source : null,
  };
  try { await d.docInsert(STORE, proj.id, `${kind}@${version}`, { ...pointer, body }); }
  catch (e) { if (e?.status === 409 || e?.body?.code === "23505") throw err(409, RACE(kind)); throw e; }
  await d.docUpsert(STORE, proj.id, kind, pointer);
  await d.audit(proj.id, "artefact", null, `artefact_installed ${kind}@${version}`, pointer.installed_by, prev, pointer);
  return pointer;
}

export async function putArtefact(key, kind, body, { actor, source } = {}, deps) {
  // MA-4a spec amendment S1: an evidence pack's items carry the bridge's hashes and attestations, so it changes only through the
  // evidence routes (evidence-store.mjs → foldArtefact) — never a hand PUT, a lead's included.
  if (kind === "evidence_pack") throw err(400, "evidence packs change only through the evidence routes; nothing was saved");
  validateArtefact(kind, body);
  if (kind === "contract" && !PLAIN_NAME.test(body.contract_key))
    throw bad(kind, "contract_key", "must be a plain name (letters, digits, . _ @ -), up to 100 characters");
  const d = await wire(deps);
  await d.requireMinRole(key, "lead");
  const proj = await d.ensureProject(key);
  const prev = await d.docGet(STORE, proj.id, kind);
  return installVersion(d, proj, kind, body, prev, { actor, source });
}

/** MA-4a: the bridge's own write of a kind whose route checked the caller itself (evidence_pack: a contributor's admission, a lead's
 *  signature — evidence-store.mjs). Validated as every install; no role check here. `expectVersion` is the version the caller read (0
 *  for none): another write since is a 409 in words, and two at once meet the create-only kind@n. → the pointer. */
export async function foldArtefact(key, kind, body, { actor, expectVersion }, deps) {
  validateArtefact(kind, body);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const prev = await d.docGet(STORE, proj.id, kind);
  if ((prev?.version || 0) !== expectVersion) throw err(409, RACE(kind));
  return installVersion(d, proj, kind, body, prev, { actor, source: null });
}
```
- [ ] **Step 3:** in `resolveArtefact` (`:404-409`), `if (officeKey) {` → `if (officeKey && !PROJECT_ONLY.includes(kind)) {`, with the comment `// MA-4a: evidence is the project's own — never its office's (PROJECT_ONLY).`
- [ ] **Step 4:** `artefact-import.mjs:2` — after `lod_matrix>` add `; evidence_pack is refused here — the evidence routes write it (MA-4a)`; `:60` → `` `--kind <${KINDS.filter((k) => k !== "evidence_pack").join("|")}>` ``.
- [ ] **Step 5: tests** — `artefact-store.test.mjs:7` imports `foldArtefact` too. New describe `"evidence_pack (MA-4a): project only, never a hand PUT, folded by the bridge"` with `const pack = (over = {}) => ({ kind: "evidence_pack", pack_id: "evp-0001", project: "p", asset: { name: "P", type: null, jurisdiction: null, crs: null }, storage_root: "C:/evidence/p", attestations: [], items: [], ...over });`:
  (a) `putArtefact("p", "evidence_pack", pack(), { actor: "x" }, memDeps())` → `{ status: 400, message: "evidence packs change only through the evidence routes; nothing was saved" }`, `d.docs.size` 0;
  (b) `foldArtefact` under `memDeps({ role: "viewer" })` with `expectVersion: 0` → version 1 (no role check); again with `expectVersion: 0` → `{ status: 409, message: "another change to evidence_pack landed at the same moment — read it again and retry; nothing was saved" }`; `d.docs.set("artefact|uuid-p|evidence_pack@2", {})` then `expectVersion: 1` → 409 (the create-only race); `d.audits.map((a) => a.action)` → `["artefact_installed evidence_pack@1"]`;
  (c) `memDeps({ parentKey: "office" })`: fold a pack on `"office"` → `resolveArtefact("p", "evidence_pack", d).source` is `"none"`; on `"office"` itself `"project"`; and `artefactReply("p", "evidence_pack", undefined, d)` → 404 `reason: "not_installed"`;
  (d) `validateArtefact("evidence_pack", pack({ asset: { name: "" } }))` → 400 `"evidence_pack: asset.name must be a non-empty string of at most 200 characters"`.
  The existing `"lists every kind"` (`:56-62`) follows `KINDS` as it is. Run `npx vitest run bridge/artefact-store.test.mjs bridge/evidence-logic.test.mjs`.
- [ ] **Step 6: commit** — `feat(bridge): MA-4a - evidence_pack is an artefact kind: project only (no office fallback), refused on a hand PUT (MA-4a spec amendment S1), written only by the bridge's own foldArtefact with a version check and a worded 409 on a race`

### Task 5 — Bridge: the evidence routes (make, read, sign, admit, re-check) and the reserved rows

**Files:** create `WebApp/bridge/evidence-store.mjs`, `WebApp/bridge/evidence-store.test.mjs`; modify `WebApp/bridge/bcf-service.mjs` (before `:1668`, and the PUT comment at `:1563-1568`), `WebApp/bridge/cde-store.mjs:1188-1201`; tests `WebApp/bridge/ledger-write.test.mjs` (the `it.each` at `:58-83`), `WebApp/bridge/write-roles.test.mjs` (import `writeFileSync` at `:12`; a new describe at the end).

- [ ] **Step 1: `evidence-store.mjs`:**
```js
// MA-4a — evidence intake (design §6.2, §6.8; plan docs/superpowers/plans/2026-10-08-ma4a-evidence-pack.md): the project's evidence
// pack (one per project, evp-0001) and the work of its routes. The files stay in the project's evidence folder on this PC (D11: scans
// stay in the office) — hashed where they lie with a streamed sha256, never held whole in memory, never uploaded or sent anywhere.
// Every trust field (storage_root, an attestation's by/role/at, admitted_by, confirmed_by) is stamped here from the verified caller,
// never taken from a body (design :166). Governed Intake's evidence branch: no delivery gate, no IDS, no upload (intake-logic.mjs
// is the IFC path and stays as it is). Deps are injected (the artefact-store idiom), so the sequencing is unit-tested on a temp folder.
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { resolveActor } from "./bridge-auth.mjs";
import * as L from "./evidence-logic.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const KIND = "evidence_pack";
const MAX_LISTED = 1000; // the folder list a GET answers; more is said (truncated)

/** Where evidence lives: SENTINEL_EVIDENCE_ROOT, else %APPDATA%/Sentinel/evidence (the CDE_FILES_ROOT idiom, bcf-service.mjs:115-121).
 *  Read at each call: pointing it at the office NAS is a restart, not a code change. */
export const evidenceRoot = () => process.env.SENTINEL_EVIDENCE_ROOT
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "evidence");

/** <root>/<key>. Keys are slugs (cde-store slugKey); anything else is refused before a path is built. */
export function evidenceDir(key, root = evidenceRoot()) {
  if (!/^[a-z0-9-]{1,128}$/.test(String(key))) throw err(400, "an evidence folder is named by the project key (letters, digits and dashes) — nothing was saved");
  return join(root, key);
}

/** `rel` inside `dir`, or a 400 (the sourceFilePath guard, bimdocs-ingest.mjs:41-48): never out of the folder, by "..", by a drive, or
 *  by a link or junction inside it (realpath, when the file exists). */
export function insideFolder(dir, rel) {
  const full = resolve(dir, rel);
  const out = () => err(400, `${rel} is not inside the project's evidence folder — name a file in it, as the folder list shows; nothing was saved`);
  if (!full.startsWith(resolve(dir) + sep)) throw out();
  if (existsSync(full) && !realpathSync(full).startsWith(realpathSync(dir) + sep)) throw out();
  return full;
}

/** sha256 and size of a file, streamed (never held whole), and its first 8 bytes for the magic check.
 *  ponytail: hashed inline in the request — fine for the MA-4a files (KB to a few GB on the local disk); MA-4h moves a 6.5 GB hash to a
 *  background job with a pending state if the inline hash is too slow over the Funnel. Re-check re-hashes the whole pack the same way,
 *  so it is budgeted (6 per user, 12 in all, a minute) and runs once at a time per project; the job moves it off the request too. */
export async function hashFile(full) {
  const fh = await open(full, "r");
  let head;
  try { const b = Buffer.alloc(8); const { bytesRead } = await fh.read(b, 0, 8, 0); head = b.subarray(0, bytesRead); }
  finally { await fh.close(); }
  const h = createHash("sha256");
  let size = 0;
  await new Promise((ok, no) => createReadStream(full).on("data", (c) => { h.update(c); size += c.length; }).on("end", ok).on("error", no));
  return { sha256: h.digest("hex"), size_bytes: size, head };
}

const isFile = (full) => existsSync(full) && statSync(full).isFile();
/** The sha256 of `rel` in `dir`, or null when no file is there. */
async function hashIfThere(dir, rel) {
  const full = insideFolder(dir, rel);
  return isFile(full) ? (await hashFile(full)).sha256 : null;
}

async function wire(deps = {}) {
  const cde = (deps.ensureProject && deps.audit && deps.takeWriteBudget) ? null : await import("./cde-store.mjs");
  const members = (deps.myRole && deps.requireMinRole) ? null : await import("./members-store.mjs");
  return {
    art: await import("./artefact-store.mjs"), artDeps: deps.artDeps,
    ensureProject: deps.ensureProject || cde.ensureProject,
    audit: deps.audit || cde.audit,
    takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
    myRole: deps.myRole || members.myRole,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    root: deps.root ?? evidenceRoot(),
    now: deps.now || (() => new Date().toISOString()),
  };
}

/** The caller's role check, then the project row: evidence is kept for a project that belongs to an office — never on the office row
 *  itself (design §6.7: project scope). Not requireSpend: nothing here spends the office's storage or AI, and its words say so. */
async function officeProject(d, key, min) {
  await d.requireMinRole(key, min);
  const proj = await d.ensureProject(key);
  if (proj.kind === "office") throw err(400, "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved");
  if (!proj.office_key) throw err(403, `${key} belongs to no office — evidence is kept for office projects (a lead of the office attaches it in Project settings ▸ Office); nothing was saved`);
  return proj;
}
const rechecking = new Set(); // MA-4a: the projects whose Re-check is running — one at a time per project

/** The pack in force (the project's own — no office fallback) or a 404 in words; `packId` must be its id (one pack per project, MA-4a S1). */
async function packOf(d, key, packId) {
  const doc = await d.art.getArtefact(key, KIND, d.artDeps);
  if (!doc) throw err(404, `${key} has no evidence pack yet — a lead makes it (POST /cde/${key}/evidence) — nothing was saved`);
  if (doc.body.pack_id !== packId) throw err(404, `${key}'s evidence pack is ${doc.body.pack_id}, not ${packId} — nothing was saved`);
  return { pack: doc.body, version: doc.version, sha256: doc.sha256 };
}
/** evidence_pack@n+1, storage_root re-stamped to this bridge's folder — a 409 in words when another write landed first. */
const fold = (d, key, pack, version, who) =>
  d.art.foldArtefact(key, KIND, { ...pack, storage_root: evidenceDir(key, d.root) }, { actor: who, expectVersion: version }, d.artDeps);
const row = async (d, proj, type, action, who, value) => {
  const r = await d.audit(proj.id, type, null, action, who, null, value);
  return { id: r?.id ?? null, hash: r?.hash ?? null };
};
const actor = () => resolveActor(null, "machine");

/** The folder's files not yet admitted — names and sizes only, never contents. A flagged (changed) item's file is listed again, so it
 *  can be admitted once restored; a registration report of an item is not listed. Links and junctions are skipped (not files). */
function folderFiles(dir, pack) {
  if (!existsSync(dir)) return { files_not_admitted: [], truncated: false };
  const taken = new Set(pack.items.flatMap((i) => [i.state === "changed" ? null : i.path, i.registration?.report_path].filter(Boolean)));
  const files = [];
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const rel = relative(dir, join(e.parentPath, e.name)).split(sep).join("/");
    if (!taken.has(rel)) files.push({ path: rel, size_bytes: statSync(join(dir, rel)).size });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files_not_admitted: files.slice(0, MAX_LISTED), truncated: files.length > MAX_LISTED };
}

/** POST /cde/:key/evidence {asset?} → 201 the new pack: a lead of a project that belongs to an office (or the machine credential); one
 *  per project; an office row is a 400 (packs cannot be deleted, so one made on the office would stay there for good). */
export async function makePack(key, b = {}, deps) {
  const d = await wire(deps);
  const proj = await officeProject(d, key, "lead");
  if (await d.art.getArtefact(key, KIND, d.artDeps)) throw err(409, `${key} already has its evidence pack ${L.PACK_ID} (one pack per project) — nothing was saved`);
  const dir = evidenceDir(key, d.root);
  const pointer = await fold(d, key, L.newPack(key, proj.name, b.asset, dir), 0, actor());
  mkdirSync(dir, { recursive: true }); // where the office puts the files, by hand
  return { pack: (await packOf(d, key, L.PACK_ID)).pack, ref: `${KIND}@${pointer.version}`, sha256: pointer.sha256, folder: dir };
}

/** GET /cde/:key/evidence/:pack → the pack, its ref, and the folder: {path, exists, files_not_admitted, truncated}. Any member. */
export async function readPack(key, packId, deps) {
  const d = await wire(deps);
  const { pack, version, sha256 } = await packOf(d, key, packId);
  const dir = evidenceDir(key, d.root);
  return { pack, ref: `${KIND}@${version}`, sha256, folder: { path: dir, exists: existsSync(dir), ...folderFiles(dir, pack) } };
}

/** POST /cde/:key/evidence/:pack/attest {code} → 201: a signed-in lead or owner signs one of (a)-(e), once per pack. The machine
 *  credential never signs (an attestation is a person's). One attestation:signed row with the pinned text's sha256. */
export async function signAttestation(key, packId, b = {}, deps) {
  const d = await wire(deps);
  if ((await d.myRole(key)) === "service") throw err(403, "an attestation needs a person: sign in. Nothing was saved.");
  const role = await d.requireMinRole(key, "lead");
  const code = typeof b.code === "string" ? b.code.trim().toLowerCase() : "";
  if (!L.ATTESTATIONS[code]) throw err(400, "code must be one of a, b, c, d, e — the attestation to sign; nothing was saved");
  const { pack, version } = await packOf(d, key, packId);
  const done = pack.attestations.find((a) => a.code === code);
  if (done) throw err(409, `attestation (${code}) on ${packId} was signed by ${done.by} at ${done.at} — each is signed once per pack; nothing was saved`);
  const who = actor();
  const att = { id: L.nextId("att", pack.attestations), code, text_sha256: L.ATTESTATIONS[code].sha256, by: who, role, at: d.now() };
  const pointer = await fold(d, key, { ...pack, attestations: [...pack.attestations, att] }, version, who);
  const ledger = await row(d, await d.ensureProject(key), "attestation", `attestation:signed ${code} ${packId}`, who,
    { pack_id: packId, id: att.id, code, text_sha256: att.text_sha256, actor: who, role });
  return { attestation: att, text: L.ATTESTATIONS[code].text, pack_version: pointer.version, ledger };
}

/** POST /cde/:key/evidence/:pack/items {path, kind, provider?, registration?} — Governed Intake's evidence branch. A signed-in
 *  contributor of an office project (the machine credential is a 403: an admission names who admitted and confirmed it). Refusals before
 *  any store, no row, in this order: 403, 429, 400 (body, path), 404 (no pack), 409 (the signatures its kind needs), 404 (no file), 409
 *  (already admitted and not flagged — before any policy check, so an admitted file is never put On hold by a bad body), 400 (a new
 *  item's method or report), 409 (the cap). Then a policy or content refusal is 200 {verdict: "refused", reasons, ledger} with one
 *  evidence:refused row (it then shows On hold until the path is admitted or dismissed); an admission is 201 {verdict: "admitted", item,
 *  pack_version, ledger} with one evidence:admitted row. The pack never changes an item's sha: a changed file is flagged by Re-check,
 *  and admitted again only as the same bytes. */
export async function runEvidenceIntake(key, packId, b = {}, deps) {
  const d = await wire(deps);
  if ((await d.myRole(key)) === "service") throw err(403, "an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved.");
  const proj = await officeProject(d, key, "contributor");
  d.takeWriteBudget("evidence admissions", { perUser: 30, all: 90 });
  const input = L.readAdmitBody(b);
  const { pack, version } = await packOf(d, key, packId);
  const missing = L.missingAttestations(pack, L.ADMIT_NEEDS[input.kind] ?? L.ADMIT_NEEDS.scan);
  if (missing.length) throw err(409, `a lead must sign ${L.codesSaid(missing)} first; nothing was saved`);
  const dir = evidenceDir(key, d.root), full = insideFolder(dir, input.path), who = actor();
  if (!isFile(full)) throw err(404, `no file ${input.path} in the project's evidence folder (${dir}) — put it there first; nothing was saved`);
  const prev = pack.items.find((i) => i.path === input.path);
  if (prev && prev.state !== "changed") throw err(409, `${input.path} is already admitted as ${prev.id} (Re-check finds a changed file) — nothing was saved`);
  if (!prev) {
    const missingField = L.newItemRefusal(input);
    if (missingField) throw err(400, missingField);
    if (pack.items.length >= L.MAX_ITEMS) throw err(409, `the evidence pack holds ${L.MAX_ITEMS} items, its cap — nothing was saved`);
  }
  const refuse = async (reasons, sha256 = null) => ({ verdict: "refused", path: input.path, sha256, reasons,
    ledger: await row(d, proj, "evidence", `evidence:refused ${input.path}`, who, { pack_id: packId, path: input.path, sha256, reasons }) });
  const policy = L.policyRefusals(input);
  if (policy.length) return refuse(policy);
  const format = L.formatOf(input.path);
  const f = await hashFile(full);
  const bad = L.magicRefusal(format, f.head);
  if (bad) return refuse([bad], f.sha256);
  if (prev && prev.sha256 !== f.sha256) return refuse(["changed since admitted"], f.sha256); // flagged already (Re-check)
  let item;
  if (prev) {
    // The restored file: the item comes back as first admitted (its registration and report too; the body's are not read) — if its
    // report still matches.
    const rp = prev.registration?.report_path;
    if (rp && (await hashIfThere(dir, rp)) !== prev.registration.report_sha256) return refuse(["its registration report changed since admitted"], f.sha256);
    item = L.readmitted(prev);
  } else {
    let report = null;
    if (input.registration?.report_path) {
      const rf = insideFolder(dir, input.registration.report_path);
      if (!isFile(rf)) throw err(404, `no registration report ${input.registration.report_path} in the project's evidence folder — put it there first; nothing was saved`);
      report = await hashFile(rf);
    }
    item = L.newItem({ id: L.nextId("ev", pack.items), input, format, sha256: f.sha256, size_bytes: f.size_bytes, report, pack, who, at: d.now() });
  }
  const items = prev ? pack.items.map((i) => (i === prev ? item : i)) : [...pack.items, item];
  const pointer = await fold(d, key, { ...pack, items }, version, who);
  const ledger = await row(d, proj, "evidence", `evidence:admitted ${item.id} ${item.path}`, who, L.admittedValue(packId, item, pointer.version, !!prev));
  return { verdict: "admitted", item, pack_version: pointer.version, ledger };
}

/** POST /cde/:key/evidence/:pack/recheck → 200: re-hashes every admitted item (and its registration report). A changed or missing
 *  one is flagged in one new pack version, with one evidence:refused row each; an item already flagged is left (its row exists).
 *  Budgeted and one at a time per project: each run re-reads every admitted file on the office PC's disk (hashFile's ponytail). */
export async function recheckPack(key, packId, deps) {
  const d = await wire(deps);
  const proj = await officeProject(d, key, "contributor");
  d.takeWriteBudget("evidence rechecks", { perUser: 6, all: 12 });
  if (rechecking.has(key)) throw err(409, `a re-check of ${key} is already running — nothing was saved`);
  rechecking.add(key);
  try { return await recheckRun(d, proj, key, packId); } finally { rechecking.delete(key); }
}
async function recheckRun(d, proj, key, packId) {
  const { pack, version } = await packOf(d, key, packId);
  const dir = evidenceDir(key, d.root), who = actor();
  const changed = [], items = [];
  for (const i of pack.items) {
    if (i.state === "changed") { items.push(i); continue; }
    const now = await hashIfThere(dir, i.path);
    const rp = i.registration?.report_path;
    const reason = now === null ? "missing from the evidence folder" : now !== i.sha256 ? "changed since admitted"
      : rp && (await hashIfThere(dir, rp)) !== i.registration.report_sha256 ? "its registration report changed since admitted" : null;
    items.push(reason ? L.flagged(i, now, d.now()) : i);
    if (reason) changed.push({ item_id: i.id, path: i.path, sha256: now, reason });
  }
  const pack_version = changed.length ? (await fold(d, key, { ...pack, items }, version, who)).version : version;
  const ledger = [];
  for (const c of changed) ledger.push(await row(d, proj, "evidence", `evidence:refused ${c.path}`, who, { pack_id: packId, item_id: c.item_id, path: c.path, sha256: c.sha256, reasons: [c.reason] }));
  const still = pack.items.filter((i) => i.state === "changed").length;
  return { checked: pack.items.length - still, changed, still_changed: still, pack_version, ledger };
}
```
- [ ] **Step 2: the routes** — in `bcf-service.mjs`, before `// Manifests (Federation Gate inputs)` (`:1668`):
```js
      // MA-4a: evidence intake (design §6.2, §6.8). POST /cde/:key/evidence {asset?} → 201 the pack (a lead; one per project, evp-0001).
      //   GET /cde/:key/evidence/:pack → the pack and the folder's files not yet admitted (any member). POST …/:pack/attest {code} → 201
      //   (a signed-in lead; the machine credential is a 403). POST …/:pack/items {path, kind, provider?, registration?} → 201 admitted |
      //   200 refused, with its ledger row (a contributor of an office project). POST …/:pack/recheck → 200. Small JSON only: the files are
      //   in the project's evidence folder on this PC and are hashed there (evidence-store.mjs); no evidence byte crosses this route.
      if (p2 === "evidence") {
        const ev = await import("./evidence-store.mjs");
        const body = async () => (await readBody(req, { max: SMALL_JSON })) || {};
        if (!p3 && req.method === "POST") return send(res, 201, await ev.makePack(p1, await body()));
        if (p3 && !p4 && req.method === "GET") return send(res, 200, await ev.readPack(p1, p3));
        if (p3 && p4 === "attest" && !seg[5] && req.method === "POST") return send(res, 201, await ev.signAttestation(p1, p3, await body()));
        if (p3 && p4 === "items" && !seg[5] && req.method === "POST") {
          const r = await ev.runEvidenceIntake(p1, p3, await body());
          return send(res, r.verdict === "admitted" ? 201 : 200, r);
        }
        if (p3 && p4 === "recheck" && !seg[5] && req.method === "POST") return send(res, 200, await ev.recheckPack(p1, p3));
      }
```
In the artefact route's comment (`:1567`), after `publish: exactly {auto: true} or {auto: false}, …` add `//   evidence_pack: refused (400) — the evidence routes write it (MA-4a spec amendment S1)`.
- [ ] **Step 3: reserved rows** — `cde-store.mjs:1198-1201`:
```js
// MA-3a (review amendment C5): changeset_reviewed and changeset_reopened are the record of the web desk's decisions and a lead's
// re-open (changesets-store reviewChangeset / reopenGhost) — never written through the open route.
// MA-4a: evidence:admitted / evidence:refused and attestation:signed (entity_types evidence, attestation) are the evidence routes'
// own (evidence-store.mjs) — the Holding Area reads them as fact, and a note may not pass for one.
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:", "review:", "changeset_reviewed", "changeset_reopened", "geometry linked", "evidence:", "attestation:"];
const RESERVED_TYPES = ["stage_gate", "hold", "delivery_gate", "review", "platform_gate", "evidence", "attestation"];
```
(`recordNote` writes a lead's note through `recordAudit`, so a note whose words begin `evidence:` or `attestation:` is the same 400.)
- [ ] **Step 4: tests** —
  `ledger-write.test.mjs`, in the `it.each` before `])("%j → 400"`:
```js
    // MA-4a: evidence intake's rows are the evidence routes' own (evidence-store.mjs); the Holding Area reads them as fact.
    [{ entity_type: "event", action: "evidence:admitted ev-0001 scans/a.las" }, "evidence: rows are written by Sentinel, not through this route"],
    [{ entity_type: "note", action: " Attestation:signed a evp-0001" }, "attestation: rows are written by Sentinel, not through this route"],
    [{ entity_type: "evidence", action: "recorded" }, "evidence rows are written by Sentinel, not through this route"],
    [{ entity_type: " Attestation ", action: "recorded" }, "attestation rows are written by Sentinel, not through this route"],
```
  `evidence-store.test.mjs` (header `// MA-4a — evidence intake end to end on a temp evidence folder: the pack, the signatures, admission (streamed sha, magic, policy), a changed file refused and flagged, Re-check, re-admission — deps injected, no Supabase.`). Harness: `root = mkdtempSync(join(tmpdir(), "sentinel-evidence-"))` in `beforeEach`, removed in `afterEach`; `docs` a `Map`, `audits` an array, `role` a `let`; deps:
```js
const rank = { viewer: 1, contributor: 2, lead: 3, owner: 4 };
const deps = () => ({
  root, now: () => "2026-10-08T10:00:00.000Z",
  artDeps: {
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    docGet: async (s, p, d) => docs.get(`${s}|${p}|${d}`) ?? null,
    docInsert: async (s, p, d, data) => { const k = `${s}|${p}|${d}`; if (docs.has(k)) throw Object.assign(new Error("duplicate"), { status: 409 }); docs.set(k, data); },
    docUpsert: async (s, p, d, data) => { docs.set(`${s}|${p}|${d}`, data); },
    audit: async () => {}, requireMinRole: async () => {}, officeKeyOf: async () => null, officeArtefact: async () => null,
  },
  ensureProject: async (key) => ({ id: `uuid-${key}`, key, name: "Demo", kind: key === "office" ? "office" : "project", office_key: key === "office" || key === "loose" ? null : "office" }),
  audit: async (_pid, et, _eid, action, actor, _o, newv) => { audits.push({ et, action, actor, newv }); return { id: audits.length, hash: "ab".repeat(32) }; },
  takeWriteBudget: (what, limits) => { budgets.push([what, limits]); },
  myRole: async () => role,
  requireMinRole: async (_k, min) => { if (role !== "service" && (rank[role] ?? 0) < rank[min]) throw Object.assign(new Error(`this action requires the ${min} role (you are ${role})`), { status: 403 }); return role; },
});
const put = (rel, bytes) => { const f = join(root, "demo", rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, bytes); };
const LAS = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(300, 7)]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sign = async (codes) => { const was = role; role = "lead"; for (const code of codes) await signAttestation("demo", "evp-0001", { code }, deps()); role = was; };
const ready = async () => { role = "lead"; await makePack("demo", {}, deps()); await sign(["a", "c", "d"]); role = "contributor"; };
```
  (`budgets` is an array reset in `beforeEach`, like `audits`.) The cases:
  (a) `ready()`; `put` `scans/tiny.las` (LAS), `photos/own.jpg` (JPG), `scans/site.rcp` (`"rcp stand-in"`), `scans/site-registration.txt` (`"report"`); admit the three (`{path, kind:"scan", registration:{method:"registered in source"}}`, `{path, kind:"photo"}`, the RCP with `report_path: "scans/site-registration.txt"`) → each `verdict: "admitted"`; the items `ev-0001..ev-0003`; the LAS `sha256` `sha(LAS)` and `size_bytes` 304; the RCP `surveyable: false` and `registration.report_sha256` `sha(Buffer.from("report"))`; every item `allowed_uses` equals `USES`; the scans' `attestation_ids` `["att-0001", "att-0002"]` and the photo's `["att-0001", "att-0002", "att-0003"]`; `admitted_by: "machine"` (no auth context in the unit test; the identity is write-roles'); `audits.filter((a) => a.action.startsWith("evidence:admitted")).length` 3 and the third's `newv.pack_version` 7 (make 1, sign 2-4, admit 5-7); `readPack` lists none of the four files (the report is not listed); `budgets` holds `["evidence admissions", { perUser: 30, all: 90 }]`;
  (b) the signatures by kind: after `makePack` alone, a scan → `{ status: 409, message: "a lead must sign (a) and (c) first; nothing was saved" }` and no audit row; `sign(["a", "c"])`, then the photo → 409 `"a lead must sign (d) first; nothing was saved"`, no row; `sign(["d"])` → the photo `admitted`. `path: "../x"` → 400 with no row; a file not there → 404 `"no file scans/none.las in the project's evidence folder (…) — put it there first; nothing was saved"` (toContain), even with `provider: "google"` (no row: a made-up path writes nothing); `role = "service"` → 403 `"an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved."`; a new scan with no `registration` → 400 the `registration.method` words; a new `site.rcp` with a method and no report → 400 the RCP words;
  (c) refused with rows, each on a file that is there and not admitted: `put` `photos/street.jpg` (JPG); `{path:"photos/street.jpg", kind:"photo", provider:"google"}` → `verdict: "refused"`, reasons the RED words, `audits` gains `evidence:refused photos/street.jpg`; the same path with `provider` left out → `admitted` as `ev-0001` (its hold clears — Task 6); `provider: "google"` again on the now admitted `photos/street.jpg` → 409 `"photos/street.jpg is already admitted as ev-0001 (Re-check finds a changed file) — nothing was saved"` and no row; `notes/a.txt` as photo → refused, the format words; a `.las` whose bytes are `PK\x03\x04…` → the magic words with its sha; `drawings/A-101.pdf` (put) as `kind: "drawing"` → `["drawings come through Ask the owner (MA-4b)"]`;
  (d) the changed file: admit the LAS, then `put` it with one byte changed; admitting it again → 409 `"scans/tiny.las is already admitted as ev-0001 (Re-check finds a changed file) — nothing was saved"`, no row; `recheckPack` → `changed: [{ item_id: "ev-0001", path: "scans/tiny.las", sha256: sha(changed), reason: "changed since admitted" }]`, the item `state: "changed"`, one `evidence:refused scans/tiny.las` row; a second recheck → `changed: []`, `still_changed: 1`, no new row; `readPack` lists `scans/tiny.las` again; admitting the changed bytes now → refused `"changed since admitted"` (no new pack version); `put` the original back and admit `{path, kind: "scan"}` with no registration → `verdict: "admitted"`, the item `ev-0001` with no `state` and its first `registration`, the row's `newv.readmitted` true; a second admit → 409 `"scans/tiny.las is already admitted as ev-0001 (Re-check finds a changed file) — nothing was saved"`. The RCP the same way: admit it with its report, change `scans/site.rcp`, recheck flags it, restore it, admit `{ path: "scans/site.rcp", kind: "scan" }` (no registration, no report) → `admitted` with the original `registration.report_sha256`;
  (e) signing: `role = "service"` → `{ status: 403, message: "an attestation needs a person: sign in. Nothing was saved." }`; `role = "contributor"` → 403 `"this action requires the lead role (you are contributor)"`; `role = "lead"`, `(a)` twice → 409 `"attestation (a) on evp-0001 was signed by machine at 2026-10-08T10:00:00.000Z — each is signed once per pack; nothing was saved"`; `code: "z"` → 400; the `attestation:signed` row's `newv.text_sha256` equals `ATTESTATIONS.a.sha256`;
  (f) one pack, on a project: a second `makePack` → 409; `readPack("demo", "evp-0002")` → 404 `"demo's evidence pack is evp-0001, not evp-0002 — nothing was saved"`; `readPack("other", "evp-0001")` → 404 `"other has no evidence pack yet — a lead makes it (POST /cde/other/evidence) — nothing was saved"`; `makePack` writes the folder `join(root, "demo")`; the pack's `storage_root` is that folder; `makePack("office")` as lead → `{ status: 400, message: "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved" }` and `docs.size` unchanged; `makePack("loose")` → 403 `"loose belongs to no office — evidence is kept for office projects (a lead of the office attaches it in Project settings ▸ Office); nothing was saved"`;
  (g) the cap: after `ready()`, push 100 valid items into the stored body (`docs.get("artefact|uuid-demo|evidence_pack@4").body.items.push(...)`, each `{ id: ev-0001…, kind: "photo", format: "jpg", sha256: "a".repeat(64), size_bytes: 1, path: \`p/${i}.jpg\`, provider: "own", licence: "owner-supplied", attestation_ids: ["att-0001", "att-0002", "att-0003"], allowed_uses: { ...USES }, surveyable: true, admitted_by: "x", admitted_at: "t" }`), `put` `photos/own.jpg`, admit → 409 `"the evidence pack holds 100 items, its cap — nothing was saved"`;
  (h) **E-7 offline**: `readFileSync(new URL("./evidence-store.mjs", import.meta.url), "utf8")` contains none of `"readRaw"`, `"fetch("`, `"uploadIfc"`, `"/cde/files"`, `"thatopen"`; and every module it imports — the `from "…"` and `import("…")` specifiers, matched with `/(?:from|import\()\s*["']([^"']+)["']/g` — is a `node:` built-in or one of `./bridge-auth.mjs`, `./evidence-logic.mjs`, `./artefact-store.mjs`, `./cde-store.mjs`, `./members-store.mjs`;
  (i) Re-check is budgeted and runs once at a time: after `ready()` and one admitted LAS, `recheckPack` pushes `["evidence rechecks", { perUser: 6, all: 12 }]` to `budgets`; `Promise.allSettled([recheckPack(…), recheckPack(…)])` → one fulfilled, one rejected `{ status: 409, message: "a re-check of demo is already running — nothing was saved" }`; a third, after both, is fulfilled (the guard is released, also after a throw — a `readPack` of `evp-0002` through `recheckPack("demo", "evp-0002")` is a 404, then a recheck of `evp-0001` runs); a viewer → 403 `"this action requires the contributor role (you are viewer)"`.
  `write-roles.test.mjs`: `:12` imports `writeFileSync` too. A new describe at the end:
```js
describe("evidence intake (MA-4a): who makes, signs, admits and reads", () => {
  const DIR = () => join(tmp, "appdata", "Sentinel", "evidence", "demo");   // the bridge copy's APPDATA (beforeAll)
  const E = "/cde/demo/evidence";
  const rows = (prefix) => db.audit_log.filter((r) => String(r.action).startsWith(prefix));
  const LAS = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(400, 7)]);
  beforeEach(() => { db.projects[0].office_key = "office"; rmSync(DIR(), { recursive: true, force: true }); });
  it("a lead makes the one pack in the bridge's own folder; a viewer and a contributor may not; a second is a 409; a PUT of it is refused in words", async () => {
    expect(await call("POST", E, "viewer", {})).toEqual(refused("lead", "viewer"));
    expect(await call("POST", E, "contributor", {})).toEqual(refused("lead", "contributor"));
    db.projects[0].kind = "office"; db.projects[0].office_key = null;
    expect(await call("POST", E, "lead", {})).toEqual({ status: 400, body: { message: "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved" } });
    db.projects[0].kind = "project"; db.projects[0].office_key = "office";
    const made = await call("POST", E, "lead", { asset: { name: "Demo tower", storage_root: "C:/elsewhere" } });
    expect(made.status).toBe(201);
    expect(made.body.pack).toMatchObject({ kind: "evidence_pack", pack_id: "evp-0001", project: "demo", asset: { name: "Demo tower" }, attestations: [], items: [], storage_root: DIR() });    expect((await call("POST", E, "lead", {})).status).toBe(409);
    expect(await call("PUT", "/cde/demo/artefacts/evidence_pack", "lead", made.body.pack)).toEqual({ status: 400, body: { message: "evidence packs change only through the evidence routes; nothing was saved" } });
  });
  it("signing: the machine credential and a contributor are refused; a lead signs (a) once, its text's sha on the ledger", async () => {
    await call("POST", E, "lead", {});
    expect(await call("POST", `${E}/evp-0001/attest`, "machine", { code: "a" })).toEqual({ status: 403, body: { message: "an attestation needs a person: sign in. Nothing was saved." } });
    expect(await call("POST", `${E}/evp-0001/attest`, "contributor", { code: "a" })).toEqual(refused("lead", "contributor"));
    const s = await call("POST", `${E}/evp-0001/attest`, "lead", { code: "a", by: "someone@example.test" });
    expect(s.status).toBe(201);
    expect(s.body.attestation).toMatchObject({ id: "att-0001", code: "a", by: "lead@example.test", role: "lead", text_sha256: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546" });
    expect(rows("attestation:signed").map((r) => [r.entity_type, r.new_value.code, r.new_value.text_sha256])).toEqual([["attestation", "a", "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546"]]);
    const again = await call("POST", `${E}/evp-0001/attest`, "lead", { code: "a" });
    expect(again.status).toBe(409); expect(again.body.message).toContain("was signed by lead@example.test");
  });
  it("admitting: a 409 before (a) and (c), a photo also (d); a contributor admits with the streamed sha; the machine credential, a viewer and ../x are refused with no row; google on a file not admitted is refused with a row; a viewer reads; a forged row is a 400", async () => {
    await call("POST", E, "lead", {});
    mkdirSync(join(DIR(), "scans"), { recursive: true }); writeFileSync(join(DIR(), "scans", "tiny.las"), LAS);
    mkdirSync(join(DIR(), "photos"), { recursive: true }); writeFileSync(join(DIR(), "photos", "street.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
    const body = { path: "scans/tiny.las", kind: "scan", registration: { method: "registered in source" }, admitted_by: "someone@example.test" };
    expect(await call("POST", `${E}/evp-0001/items`, "contributor", body)).toEqual({ status: 409, body: { message: "a lead must sign (a) and (c) first; nothing was saved" } });
    for (const code of ["a", "c"]) await call("POST", `${E}/evp-0001/attest`, "lead", { code });
    const photo = { path: "photos/street.jpg", kind: "photo", provider: "google" };
    expect(await call("POST", `${E}/evp-0001/items`, "contributor", photo)).toEqual({ status: 409, body: { message: "a lead must sign (d) first; nothing was saved" } });
    expect(await call("POST", `${E}/evp-0001/items`, "viewer", body)).toEqual(refused("contributor", "viewer"));
    expect(await call("POST", `${E}/evp-0001/items`, "machine", body)).toEqual({ status: 403, body: { message: "an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved." } });
    const ok = await call("POST", `${E}/evp-0001/items`, "contributor", body);
    expect(ok.status).toBe(201);
    expect(ok.body.item).toMatchObject({ id: "ev-0001", format: "las", sha256: createHash("sha256").update(LAS).digest("hex"), size_bytes: LAS.length, admitted_by: "contributor@example.test", attestation_ids: ["att-0001", "att-0002"], allowed_uses: { texture_embed: false, redistribute: false }, registration: { method: "registered in source", confirmed_by: "contributor@example.test" } });
    expect(rows("evidence:admitted")).toHaveLength(1);
    const before = db.audit_log.length;
    expect((await call("POST", `${E}/evp-0001/items`, "contributor", { ...body, path: "../x" })).status).toBe(400);
    expect(db.audit_log.length).toBe(before);
    expect((await call("POST", `${E}/evp-0001/items`, "contributor", { ...body, provider: "google" })).status).toBe(409); // admitted: no row
    expect(db.audit_log.length).toBe(before);
    await call("POST", `${E}/evp-0001/attest`, "lead", { code: "d" });
    const red = await call("POST", `${E}/evp-0001/items`, "contributor", photo);
    expect(red.status).toBe(200); expect(red.body.verdict).toBe("refused"); expect(rows("evidence:refused").map((r) => r.action)).toEqual(["evidence:refused photos/street.jpg"]);
    const read = await call("GET", `${E}/evp-0001`, "viewer");
    expect(read.status).toBe(200); expect(read.body.pack.items.map((i) => i.path)).toEqual(["scans/tiny.las"]);
    expect(await call("POST", `${E}/evp-0001/recheck`, "viewer")).toEqual(refused("contributor", "viewer"));
    expect((await call("GET", `${E}/evp-0002`, "viewer")).status).toBe(404);
    expect(await call("POST", "/cde/demo/audit", "lead", { action: "evidence:admitted ev-0002 scans/forged.las" })).toEqual({ status: 400, body: { message: "evidence: rows are written by Sentinel, not through this route" } });
  });
});
```
  Run `npx vitest run bridge/evidence-store.test.mjs bridge/evidence-logic.test.mjs bridge/artefact-store.test.mjs bridge/ledger-write.test.mjs bridge/write-roles.test.mjs`.
- [ ] **Step 5: commit** — `feat(bridge): MA-4a - evidence intake routes: a lead makes the project's one evidence pack (never on an office row), signs (a)-(e) once each (a person, never the machine credential), a signed-in contributor admits own scans and photos (a photo after (d) too; a file already admitted is a 409 before any policy check) from the project's evidence folder by a streamed sha256 (evidence:admitted / evidence:refused with reasons), Re-check (budgeted, one at a time) flags a changed file; evidence: and attestation: rows reserved on the open audit route`

### Task 6 — Bridge: refused evidence in the Holding Area

**Files:** modify `WebApp/bridge/holding-logic.mjs:10` and add `evidenceHolds`; `WebApp/bridge/cde-store.mjs:1480-1502` (`readHolding`); tests `WebApp/bridge/holding-logic.test.mjs` (import at `:5`), `WebApp/bridge/cde-store-holding.test.mjs`.

MA-4a spec amendment S2 (decision 12b): the design asks the Holding Area only for the survey's gap groups (MA-4d); holding refused evidence there is this slice's addition, recorded in the design by Task 8. It relies on Task 5's order: a refusal row is written only for a file that is there and not admitted (unflagged), so every hold can clear by an admission of its path or by a lead's dismissal.

- [ ] **Step 1:** `holding-logic.mjs:10` → `const REFUSAL = /^hold:(gate|naming|ids|evidence) /; // MA-4a: evidence, from evidenceHolds (no hold row of its own)`. After `clearedRecent` (`:64`):
```js
/** MA-4a: refused evidence on hold, read from the evidence rows themselves (no second hold row): each evidence:refused row is a refusal
 *  of its path (stage evidence), each evidence:admitted row a registration of that path, accepted — so the item clears when the same
 *  path is admitted later, or when a lead dismisses it (hold:dismissed <path>, the existing dismissal). A path and a container name
 *  never meet: no evidence format is an .ifc. Pure. → {rows, versions} for heldItems' holdRows and versionsByName. */
export function evidenceHolds(evidenceRows) {
  const rows = [], versions = {};
  for (const r of evidenceRows || []) {
    const v = r.new_value || {}, path = String(v.path ?? ""), reasons = Array.isArray(v.reasons) ? v.reasons : [];
    if (String(r.action).startsWith("evidence:refused ")) rows.push({ ...r, action: `hold:evidence ${path}`, new_value: {
      container_name: path, stage: "evidence", verdict: "refused", failures: reasons.map((x) => ({ requirement: "evidence intake", detail: String(x) })),
      failures_total: reasons.length, source: "evidence" } });
    else if (String(r.action).startsWith("evidence:admitted ")) (versions[path] ||= []).push({ id: `ledger-${r.id}`, created_at: r.at, verdict: "accepted" });
  }
  return { rows, versions };
}
```
- [ ] **Step 2:** `readHolding` — `:1482` imports `evidenceHolds` too; declare `evRows`; after `:1486`: `evRows = await auditAll(key, { entity_type: "evidence" }); // MA-4a: refused evidence is held from its own rows`. Before `const core = …` (`:1497`):
```js
  // MA-4a: the evidence rows as hold timelines — an admission of the same path clears a refusal, as a registration clears a name.
  const ev = evidenceHolds(evRows);
  for (const [path, list] of Object.entries(ev.versions)) (versionsByName[path] ||= []).push(...list);
  const held = [...rows, ...ev.rows];
```
and `:1499` → `items: heldItems(held, rows, versionsByName), cleared_recent: clearedRecent(held, rows, versionsByName),`. `dismissHold` (`:1541`) is unchanged: it dismisses any `container_name` in `readHolding().items`, now a path too.
- [ ] **Step 3: tests** — `holding-logic.test.mjs` imports `evidenceHolds`; describe `"evidenceHolds — refused evidence on hold from its own rows (MA-4a)"`:
```js
  const ev = (id, min, verb, path, reasons = ["changed since admitted"]) => ({ id, at: at(min), hash: hash(id), actor: "c@example.test", action: `evidence:${verb} ${path}`, new_value: { path, reasons } });
  it("a refusal is held at stage evidence; the same path admitted later clears it; a lead's hold:dismissed of the path clears it", () => {
    const e = evidenceHolds([ev(1, 1, "refused", "scans/a.las"), ev(2, 2, "admitted", "scans/a.las"), ev(3, 1, "refused", "p/b.jpg", ["the file does not begin as a .jpg does — renamed or damaged"]), ev(4, 1, "refused", "p/c.png")]);
    const dismissed = [{ id: 5, at: at(3), action: "hold:dismissed p/c.png", new_value: { container_name: "p/c.png", reason: "replaced" } }];
    const items = heldItems(e.rows, dismissed, e.versions);
    expect(items.map((i) => [i.container_name, i.stage, i.verdict, i.source])).toEqual([["p/b.jpg", "evidence", "refused", "evidence"]]);
    expect(items[0]).toMatchObject({ failures: [{ requirement: "evidence intake", detail: "the file does not begin as a .jpg does — renamed or damaged" }], failures_total: 1, ledger: { id: 3, hash: hash(3) } });
    expect(clearedRecent(e.rows, dismissed, e.versions)).toEqual([]); // an admission clears as an accepted registration: not listed
  });
```
  `cde-store-holding.test.mjs`, describe `"readHolding — refused evidence (MA-4a)"`: push `{ id: 960, at: at(1), hash: hash(960), project_id: P, entity_type: "evidence", entity_id: null, action: "evidence:refused scans/a.las", actor: "c@example.test", new_value: { path: "scans/a.las", reasons: ["changed since admitted"] } }`, the same for `961 photos/b.jpg`, and `{ id: 962, at: at(2), …, action: "evidence:admitted ev-0001 scans/a.las", new_value: { path: "scans/a.las" } }` → `readHolding("aster-tower").items` is `[{ container_name: "photos/b.jpg", stage: "evidence", source: "evidence", ledger: { id: 961 } }]` (toMatchObject); `dismissHold("aster-tower", { container_name: "photos/b.jpg", reason: "the photo was replaced" })` → an id; then `items` `[]`; and the reads include one `audit_log` GET with `entity_type=eq.evidence`.
  Run `npx vitest run bridge/holding-logic.test.mjs bridge/cde-store-holding.test.mjs bridge/cde-store-hold.test.mjs`.
- [ ] **Step 4: commit** — `feat(bridge): MA-4a - refused evidence shows in the Holding Area at stage evidence, read from its own rows; it clears when the same path is admitted later or a lead dismisses it`

### Task 7 — Web: the Evidence section, the hold words, no Install JSON for the pack

**Files:** create `WebApp/src/setups/evidence.ts`, `WebApp/src/setups/evidence.test.ts`; modify `WebApp/src/setups/holding.ts:10-11, :53-54, :167-171`, `WebApp/src/setups/holding.test.ts` (`:184-191`), `WebApp/src/setups/files-panel.ts`, `WebApp/src/setups/project-settings-panel.ts:293`.

- [ ] **Step 1: `holding.ts`** — `HoldStage = "gate" | "naming" | "ids" | "evidence"`; `HoldSource = "revit" | "auto-publish" | "web" | "intake" | "evidence"`; `STAGE_WORDS` gains `evidence: "evidence intake"`, `SOURCE_WORDS` `evidence: "evidence folder"`; `resubmitFor`, before the last line: `if (source === "evidence") return { upload: false, text: "Put the right file in the project's evidence folder, then Admit it again under Evidence." }; // MA-4a`. `holding.test.ts:184-191` adds that expectation. (`NOT_STORED` is unchanged: it words intake uploads; every evidence refusal before a store says "nothing was saved" itself, and the section prints the bridge's words.)
- [ ] **Step 2: `evidence.ts`:**
```ts
// MA-4a — the files panel's Evidence section: the project's evidence pack (GET /cde/:key/evidence/evp-0001), its attestations (a lead
// signs each once), its admitted items, the files in the project's evidence folder on the office PC not yet admitted (Admit, a
// contributor's), and Re-check. Files are put in the folder by hand: no evidence byte passes through the browser (D11).
import { bfetch, bwrite } from "./bridge-fetch";
import { ledgerLine } from "./stage-gate";

export const PACK_ID = "evp-0001";
export const ATTESTATION_CODES = ["a", "b", "c", "d", "e"] as const;
/** The texts the bridge pins (bridge/evidence-logic.mjs); evidence.test.ts checks their sha256 against the bridge's pins. */
export const ATTESTATION_TEXTS: Record<string, string> = {
  a: "I am the owner, or authorised by the owner, of this asset.",
  b: "I have the copyright holder's permission for these drawings.",
  c: "These are my own photos and scans. People have consented, or their faces are blurred.",
  d: "None of these images are captures from Google, Apple or Azure/Bing map services.",
  e: "Our commercial licence covers this use and this deliverable.",
};
export interface Attestation { id: string; code: string; text_sha256: string; by: string; role: string; at: string; }
export interface EvidenceItem {
  id: string; kind: "scan" | "photo"; format: string; sha256: string; size_bytes: number; path: string; surveyable: boolean;
  admitted_by: string; admitted_at: string; state?: "changed"; changed_at?: string; registration?: { method: string; report_path?: string };
}
export interface EvidencePack { pack_id: string; storage_root: string; attestations: Attestation[]; items: EvidenceItem[]; }
export interface EvidenceRead { pack: EvidencePack; ref: string; folder: { path: string; exists: boolean; files_not_admitted: { path: string; size_bytes: number }[]; truncated: boolean }; }
type Ledger = { id: number | null; hash: string | null };
export interface AdmitReply { verdict: "admitted" | "refused"; item?: EvidenceItem; path?: string; reasons?: string[]; ledger: Ledger; }
export interface RecheckReply { checked: number; changed: { item_id: string; path: string; reason: string }[]; still_changed: number; pack_version: number; }

const SCAN = /\.(e57|las|laz|rcp)$/i, PHOTO = /\.(jpe?g|png)$/i;
/** A folder file's kind by its extension (the bridge's format table), or null when it is not admitted. Pure. */
export const kindOf = (path: string): "scan" | "photo" | null => (SCAN.test(path) ? "scan" : PHOTO.test(path) ? "photo" : null);
export const needsReport = (path: string): boolean => /\.rcp$/i.test(path);
const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** One admitted item in one line. Pure. */
export function itemLine(i: EvidenceItem): string {
  return `${i.id} · ${i.path} · ${i.format} · ${size(i.size_bytes)} · sha ${i.sha256.slice(0, 12)}…` +
    (i.surveyable ? "" : " · not surveyable (no ReCap here)") +
    (i.state === "changed" ? " · CHANGED since admitted — on hold; restore the file and Admit it again, or put the new file in under a new name" : "");
}
/** An attestation's state in one line. Pure. */
export function attestationLine(code: string, pack: EvidencePack): string {
  const a = pack.attestations.find((x) => x.code === code);
  return a ? `(${code}) signed by ${a.by} (${a.role}) · ${a.at.replace("T", " ").slice(0, 16)}` : `(${code}) not signed`;
}
/** The status line after Admit. Pure. */
export function admitLine(r: AdmitReply): string {
  return r.verdict === "admitted" && r.item
    ? `✓ Admitted ${r.item.path} as ${r.item.id} · sha ${r.item.sha256.slice(0, 12)}… · ${ledgerLine(r.ledger)}`
    : `Refused ${r.path ?? "the file"} — ${(r.reasons ?? []).join("; ")} · on hold · ${ledgerLine(r.ledger)}`;
}
/** The status line after Re-check. Pure. */
export function recheckLine(r: RecheckReply): string {
  return r.changed.length
    ? `Re-checked ${r.checked} item(s): ${r.changed.length} changed — ${r.changed.map((c) => `${c.path} (${c.reason})`).join("; ")}. On hold until the file is restored and admitted again.`
    : `Re-checked ${r.checked} item(s): every file matches its admitted sha.`;
}

const at = (base: string, key: string, path: string) => `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/${path}`;
const post = <T>(base: string, key: string, path: string, body: unknown) =>
  bwrite<T>(at(base, key, path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
/** The pack and its folder; null when the project has none yet (the bridge's 404 says so); any other failure throws "not read — …". */
export async function readEvidence(base: string, key: string): Promise<EvidenceRead | null> {
  let r: Response;
  try { r = await bfetch(at(base, key, `evidence/${PACK_ID}`)); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (EvidenceRead & { message?: string }) | null;
  if (r.status === 404 && /no evidence pack yet/.test(j?.message ?? "")) return null;
  if (!r.ok || !j?.pack) throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j;
}
export const makePack = (base: string, key: string) => post<{ pack: EvidencePack }>(base, key, "evidence", {});
export const signAttestation = (base: string, key: string, code: string) => post<{ attestation: Attestation; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/attest`, { code });
export const admitEvidence = (base: string, key: string, b: { path: string; kind: "scan" | "photo"; registration?: { method: string; report_path?: string } }) => post<AdmitReply>(base, key, `evidence/${PACK_ID}/items`, b);
export const recheckEvidence = (base: string, key: string) => post<RecheckReply>(base, key, `evidence/${PACK_ID}/recheck`, {});
```
- [ ] **Step 3: `files-panel.ts`** —
  imports (after `:17`): `import { readEvidence, makePack, signAttestation, admitEvidence, recheckEvidence, kindOf, needsReport, itemLine, attestationLine, admitLine, recheckLine, ATTESTATION_CODES, ATTESTATION_TEXTS, type EvidenceRead } from "./evidence";`
  state (after `:74`):
```ts
  // MA-4a: the evidence pack, read with the holds; `evidenceError` makes the section say "not read — …"; `admitting` = the folder file
  // whose registration input is open (a scan names how it was registered; an RCP also names its report).
  let evidence: EvidenceRead | null = null;
  let evidenceError: string | null = null;
  let showEvidence = false;
  let admitting: string | null = null;
```
  `load()` after the holding read (`:189`):
```ts
      admitting = null;
      try { const ev = await readEvidence(base, key); if (mine !== seq) return; evidence = ev; evidenceError = null; }
      catch (e) { if (mine !== seq) return; evidence = null; evidenceError = (e as Error).message; }
```
  and the outer `catch` (`:198`) adds `admitting = null;` to its reset line (`:201`). `render()` `:238` → `html += heldSection() + gapSection() + evidenceSection() + deletedSection();`. After the `[data-gdismissok]` wiring (it ends at `:259`):
```ts
    root.querySelector("#fv-ev-toggle")?.addEventListener("click", () => { showEvidence = !showEvidence; render(); });
    root.querySelector("#fv-ev-make")?.addEventListener("click", () => void evAct(async () => { await makePack(base, pid()); return "✓ Made the evidence pack evp-0001 — a lead signs (a) and (c); then put files in the folder it names and Admit them."; }));
    root.querySelector("#fv-ev-recheck")?.addEventListener("click", () => void evAct(async () => recheckLine(await recheckEvidence(base, pid()))));
    root.querySelectorAll<HTMLElement>("[data-evsign]").forEach((n) => n.addEventListener("click", () => void evAct(async () => {
      const r = await signAttestation(base, pid(), n.dataset.evsign!);
      return `✓ Signed (${r.attestation.code}) as ${r.attestation.by} · ${ledgerLine(r.ledger)}`;
    })));
    root.querySelectorAll<HTMLElement>("[data-evadmit]").forEach((n) => n.addEventListener("click", () => {
      const path = n.dataset.evadmit!;
      // A photo, or a flagged item coming back (the bridge keeps its first registration and report), is admitted with no form.
      const back = evidence?.pack.items.find((i) => i.path === path && i.state === "changed");
      if (back || kindOf(path) === "photo") void evAct(async () => admitLine(await admitEvidence(base, pid(), { path, kind: back?.kind ?? "photo" })));
      else { admitting = path; render(); (root.querySelector("#fv-ev-method") as HTMLInputElement | null)?.focus(); }
    }));
    root.querySelector("#fv-ev-cancel")?.addEventListener("click", () => { admitting = null; render(); });
    root.querySelector("#fv-ev-ok")?.addEventListener("click", () => {
      const path = admitting;
      if (!path) return;
      const method = (root.querySelector("#fv-ev-method") as HTMLInputElement | null)?.value.trim() ?? "";
      const report = (root.querySelector("#fv-ev-report") as HTMLSelectElement | null)?.value || "";
      admitting = null;
      void evAct(async () => admitLine(await admitEvidence(base, pid(), { path, kind: "scan", registration: { method, ...(report ? { report_path: report } : {}) } })));
    });
```
  Beside `dismissGap` (after its end, `:399`; it starts at `:390`):
```ts
  /** MA-4a: one Evidence action, then a reload; the line is the bridge's answer (a refusal before any store ends "nothing was saved"). */
  async function evAct(run: () => Promise<string>) {
    let line: string;
    try { line = await run(); } catch (e) { line = `Not done — ${(e as Error).message}`; }
    await load();
    status(line);
  }

  // MA-4a "Evidence (n)" — built like "Type gaps (n)": the project's evidence pack — its attestations (a lead signs each once), its
  // admitted items, and the files in its evidence folder on the office PC not yet admitted (Admit, a contributor's; a scan names how it
  // was registered). Files are put in the folder by hand — no bytes pass through the browser (D11). Re-check re-hashes every item.
  function evidenceSection(): string {
    if (evidenceError) return `<div style="color:#fbbf24;font-size:11px;padding:.4rem .2rem">Evidence: ${esc(evidenceError)}</div>`;
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    const line = (t: string, c = "#71717a") => `<div style="color:${c};font-size:11px;padding:.1rem .2rem">${t}</div>`;
    const toggle = `<button id="fv-ev-toggle" style="border:none;background:transparent;color:#a78bfa;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showEvidence ? "▾" : "▸"} Evidence (${evidence ? evidence.pack.items.length : 0})</button>`;
    if (!showEvidence) return toggle;
    if (!evidence) return toggle + (canGovernRole(role)
      ? line(`No evidence pack yet. <button id="fv-ev-make" style="${act}">Make the evidence pack</button>`)
      : line(`No evidence pack yet — a lead or owner makes it (${esc(roleSaid)}).`));
    const { pack, folder, ref } = evidence;
    const signer = canGovernRole(role) && role !== "service", edit = canEditRole(role);
    const atts = ATTESTATION_CODES.map((c) => {
      const done = pack.attestations.some((a) => a.code === c);
      return line(`<span style="color:${done ? "#4ade80" : "#9ca3af"}">${esc(attestationLine(c, pack))}</span> “${esc(ATTESTATION_TEXTS[c])}”` +
        (!done && signer ? ` <button data-evsign="${c}" style="${act}">Sign (${c})</button>` : ""));
    }).join("");
    const items = pack.items.map((i) => line(esc(itemLine(i)), i.state === "changed" ? "#fca5a5" : "#cbd5e1")).join("") || line("none yet");
    const files = folder.files_not_admitted.map((f) => {
      const form = admitting === f.path
        ? `<input id="fv-ev-method" maxlength="300" placeholder="How was it registered? e.g. registered in source" style="flex:1;min-width:10rem;background:#111;color:#eee;border:1px solid #6528d7;border-radius:.25rem;padding:.2rem .4rem;font:12px system-ui"/>` +
          (needsReport(f.path) ? `<select id="fv-ev-report" style="background:#111;color:#eee;border:1px solid #2c2c34;border-radius:.25rem;font:11px system-ui"><option value="">its registration report…</option>${folder.files_not_admitted.filter((x) => x.path !== f.path).map((x) => `<option value="${esc(x.path)}">${esc(x.path)}</option>`).join("")}</select>` : "") +
          `<button id="fv-ev-ok" style="${act};color:#c4b5fd">Admit</button><button id="fv-ev-cancel" style="${act}">Cancel</button>`
        : !kindOf(f.path) ? '<span style="color:#71717a">not admitted here — scans e57, las, laz, rcp; photos jpg, png</span>'
        : edit ? `<button data-evadmit="${esc(f.path)}" style="${act}">Admit</button>` : "";
      return `<div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;font-size:11px;padding:.15rem .2rem"><span style="flex:1;min-width:8rem;overflow-wrap:anywhere">${esc(f.path)} · ${esc(humanSize(f.size_bytes))}</span>${form}</div>`;
    }).join("") || line("none");
    return toggle + `<div style="margin-bottom:.45rem;padding:.45rem .55rem;background:#1b1b21;border:1px solid #2c2c34;border-radius:.4rem">` +
      `<div style="color:#71717a;font-size:10.5px;font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere">${esc(pack.pack_id)} · ${esc(ref)} · folder ${esc(folder.path)}${folder.exists ? "" : " (not there yet)"}</div>` +
      line("Attestations — a lead signs (a) and (c) before any file is admitted, and (d) before a photo", "#9ca3af") + atts +
      line(`Admitted (${pack.items.length})`, "#9ca3af") + items +
      line(`In the folder, not yet admitted (${folder.files_not_admitted.length}${folder.truncated ? ", the list stops at 1000" : ""}) — put files there on the office PC`, "#9ca3af") + files +
      (edit ? `<div style="margin-top:.35rem"><button id="fv-ev-recheck" style="${act}" title="Re-hash every admitted file; a changed one goes on hold">Re-check</button></div>`
        : line(`A contributor or above admits and re-checks — ${esc(roleSaid)}.`)) + "</div>";
  }
```
  The `onActiveProjectChange` guard (`:803-804`) adds `|| admitting`.
- [ ] **Step 4: `project-settings-panel.ts:293`** → `(canInstall && kind !== "evidence_pack" ? … : "") +` with the comment above `host.innerHTML += rows.map(` : `// MA-4a: no Install JSON… for evidence_pack — the evidence routes write it (the bridge refuses a PUT: MA-4a spec amendment S1).`
- [ ] **Step 5: tests** — `evidence.test.ts` (mock `./bridge-fetch` as `holding.test.ts:6-7` does, exporting both `bfetch` and `bwrite` as hoisted `vi.fn()`s — the real `bwrite` calls the module's own `bfetch`, which a mock does not reach; its refusal words are `bridge-write.test.ts`'s): `signAttestation(base, "demo", "a")` calls `bwrite` with `…/cde/demo/evidence/evp-0001/attest` and the body `{"code":"a"}`; (a) `createHash("sha256").update(ATTESTATION_TEXTS[c]).digest("hex")` (from `node:crypto`) equals the five pinned hashes of Task 3; (b) `kindOf("a/b.LAS")` `"scan"`, `kindOf("x.jpeg")` `"photo"`, `kindOf("r.txt")` null; `needsReport("s.RCP")` true; (c) `itemLine` of a flagged RCP → `"ev-0003 · scans/site.rcp · rcp · 1 KB · sha 0123456789ab… · not surveyable (no ReCap here) · CHANGED since admitted — on hold; restore the file and Admit it again, or put the new file in under a new name"`; (d) `attestationLine("a", pack)` → `"(a) signed by lead@example.test (lead) · 2026-10-08 10:00"`, `"(b) not signed"`; (e) `admitLine` admitted with a ledger `{ id: 1201, hash: "ab".repeat(32) }` → `"✓ Admitted scans/tiny.las as ev-0001 · sha 76c6b5e940d1… · ledger #1201 · receipt abababababababab…"`; refused → `"Refused photos/x.jpg — google is a RED source — … · on hold · ledger #…"`; (f) `recheckLine` with one change and with none — the exact words; (g) `readEvidence`: a 404 `{ message: "demo has no evidence pack yet — a lead makes it (POST /cde/demo/evidence) — nothing was saved" }` → null; a 404 `{ message: "project not found" }` → throws `"not read — project not found"`; a 200 → the body; a throw from `bfetch` → `"not read — …"`. Run `npx vitest run src/setups/evidence.test.ts src/setups/holding.test.ts`; `npm run build`.
- [ ] **Step 6: commit** — `feat(web): MA-4a - an Evidence section in the files panel (the pack's attestations with Sign for leads, the admitted items, the folder's files not yet admitted with Admit, Re-check), refused evidence words in On hold, and no Install JSON for evidence_pack`

### Task 8 — The drill script and the docs

**Files:** create `WebApp/scripts/make-tiny-las.mjs`; modify `ROADMAP.md:32`, `docs/compliance/INFORMATION_MANAGEMENT_PROCEDURE.md:77`, `docs/compliance/CERTIFICATION_READINESS_2026-10.md:25,32,72`, `docs/strategy/2026-09-30-model-automation-design.md` (`:636`, `:666-669`, `:825-826`, `:869-871`, `:886`, `:950`, `:1124`).

- [ ] **Step 1: `make-tiny-las.mjs`** (proven in a scratch run: 3,362 points, 67,467 bytes, sha256 `76c6b5e940d181f854719c2867a0565258622ae0b68485bfc4aa9f26a18d3c44`, the same bytes twice):
```js
// MA-4a drill (Session MA4a): a small synthetic LAS 1.2, point format 0 — two 10 m x 10 m slabs of points at z = 0 and z = 3 m,
// 0.25 m apart — for the project's evidence folder. Deterministic (the same bytes every run), stdlib only; MA-4c's two-storey
// generator supersedes it. Usage: node scripts/make-tiny-las.mjs <out.las>
import { writeFileSync } from "node:fs";
const out = process.argv[2];
if (!out) { console.error("Usage: node scripts/make-tiny-las.mjs <out.las>"); process.exit(2); }
const pts = [];
for (const z of [0, 3]) for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) pts.push([i * 0.25, j * 0.25, z]);
const HEADER = 227, REC = 20, SCALE = 0.001;
const b = Buffer.alloc(HEADER + pts.length * REC);
let o = 0;
const s = (t, n) => { b.write(t, o, n, "ascii"); o += n; };
const u8 = (v) => { b.writeUInt8(v, o); o += 1; };
const u16 = (v) => { b.writeUInt16LE(v, o); o += 2; };
const u32 = (v) => { b.writeUInt32LE(v, o); o += 4; };
const i32 = (v) => { b.writeInt32LE(v, o); o += 4; };
const f64 = (v) => { b.writeDoubleLE(v, o); o += 8; };
s("LASF", 4); u16(0); u16(0); o += 16;                              // signature, file source id, global encoding, GUID
u8(1); u8(2);                                                      // version 1.2
s("Sentinel MA-4a drill", 32); s("make-tiny-las.mjs", 32);         // system identifier, generating software
u16(281); u16(2026);                                               // creation day of year (2026-10-08), year
u16(HEADER); u32(HEADER); u32(0);                                  // header size, offset to the points, no VLRs
u8(0); u16(REC); u32(pts.length);                                  // point format 0, record length, point count
u32(pts.length); o += 16;                                          // points by return: every point a first return
for (let k = 0; k < 3; k++) f64(SCALE);                            // x, y, z scale
for (let k = 0; k < 3; k++) f64(0);                                // x, y, z offset
f64(10); f64(0); f64(10); f64(0); f64(3); f64(0);                  // max x, min x, max y, min y, max z, min z
if (o !== HEADER) throw new Error(`header is ${o} bytes, not ${HEADER}`);
for (const [x, y, z] of pts) { i32(Math.round(x / SCALE)); i32(Math.round(y / SCALE)); i32(Math.round(z / SCALE)); u16(0); u8(9); u8(2); u8(0); u8(0); u16(0); }
writeFileSync(out, b);
console.log(`${out}: ${pts.length} points, ${b.length} bytes`);
```
  Run it into the scratchpad twice and compare (`node scripts/make-tiny-las.mjs <scratch>/a.las`, `…/b.las`, `cmp`); `certutil -hashfile <scratch>/a.las SHA256` shows the sha above.
- [ ] **Step 2: the rename lines** — `ROADMAP.md:32`: "an evidence-pack export" → "an audit-pack export (named the evidence pack until MA-4a)"; "the project evidence-pack export" → "the project audit-pack export". `INFORMATION_MANAGEMENT_PROCEDURE.md:77`: `**evidence pack** (\`GET /cde/:key/evidence-pack\`, a lead's)` → `**audit pack** (\`GET /cde/:key/audit-pack\`, a lead's; named the evidence pack until MA-4a)`. `CERTIFICATION_READINESS_2026-10.md:25` "G3: an evidence-pack export" → "G3: an audit-pack export"; `:32` "a one-click evidence pack" → "a one-click audit pack"; `:72` `**Evidence pack** (G3) — **done 2026-10-08**: \`GET /cde/:key/evidence-pack\`` → `**Audit pack** (G3) — **done 2026-10-08** (renamed from "evidence pack" in MA-4a): \`GET /cde/:key/audit-pack\``. The sim-room history and the GhostBuilder "Evidence Packet" docs stay as they are.
- [ ] **Step 3: the design** — after `:636` (the manifest paragraph) add: `It is not the audit pack (\`GET /cde/:key/audit-pack\`), which is the Kitemark export.` After the §6.2 rules (`:666-669`) add: `- MA-4a items carry \`attestation_ids\` (the codes their kind needs: a scan (a) and (c), a photo (a), (c) and (d)) in place of one \`attestation_id\`; \`licence\` is stamped \`owner-supplied\` for own items (a body's is not read); \`rmse_mm\` waits for a measured registration (MA-4c).` Rows `:825-826`: the Status cell becomes `BUILT in MA-4a (evidence:admitted, evidence:refused; evidence:expired waits for MA-7)` and `BUILT in MA-4a ({pack_id, id, code, text_sha256, actor, role}; (a) is R:248's wording)` — the controller turns BUILT into LANDED with the drill's rows at the merge. Under `:869-871` add `- MA-4a spec amendment S1: one pack per project (\`evp-0001\`, a lead makes it), on a project that belongs to an office — an office row is a 400 (§6.7: project scope); items {path, kind, provider?, registration?} name a file already in the project's evidence folder (no upload: D11), admitted by a signed-in contributor (the machine credential is a 403); \`:pack\` must be the pack in force. MA-4a spec amendment S2: a refused item is held in the Holding Area at stage \`evidence\`, read from its own \`evidence:refused\` row, until the same path is admitted or a lead dismisses it.` At `:886` append ` — except \`evidence_pack\`, refused (400): only the evidence routes write it (MA-4a spec amendment S1).` Under MA-4's `Intake accepts evidence kinds` (`:1124`) add the sub-bullet `- Met in MA-4a by \`POST /cde/:key/evidence/:pack/items\` (the IFC intake route, \`POST /cde/:key/intake\`, stays IFC-only; evidence is never uploaded, D11).` At `:950` the row becomes `| Sign attestations (a)–(e); (a) is "I am the owner, or authorised by the owner, of this asset." (R:248) | lead, signed in (by name); the machine credential never signs (MA-4a) |`.
- [ ] **Step 4: commit** — `docs: MA-4a - the audit pack in the live docs; the design's evidence pack: the clash sentence, MA-4a spec amendments S1 and S2, the MA-4 intake line, the (a) wording and its signer, the rows built; a drill script for a small synthetic LAS`

### Task 9 — Final checks (nothing to commit)

From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore the fixture if listed), `npm run build 2>&1 | tail -3`, `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). `grep -rn "buildEvidencePack\|ps-evidence\|sentinel-evidence-pack" bridge src --include=*.mjs --include=*.ts` → only the old-name pin in `audit-pack.test.mjs`. `git status --short` shows only `.claude/`, `ab.html` and the pre-existing `package-lock.json`. Report the totals and `git log --oneline master..HEAD` (eight commits: two renames first).

## Live drill MA4a (the controller, after the build)

On a drill copy of the bridge at 4101 on the branch, then the local web app (the founder's session for the web rows). Project: **a new drill project attached to the office, `ma4a-drill`** — never `aster-tower` or any project whose evidence is real: a pack's items cannot be removed in MA-4a (no delete, no withdraw), so the drill's synthetic LAS, its RCP stand-in and its signatures stay in that pack for good. Files are put **by hand** into `%APPDATA%\Sentinel\evidence\ma4a-drill\`: `scans\tiny.las` from `node WebApp/scripts/make-tiny-las.mjs`, two own JPGs `photos\own.jpg` and `photos\street.jpg`, and a stand-in `scans\site.rcp` (an RCP is admitted by its extension only) with `scans\site-registration.txt`. `<key>` below is `ma4a-drill`.

- **E-0** Project settings ▸ **Download audit pack** saves `<key>-audit-pack-<day>.json`; the words `Saved <key>-audit-pack-<day>.json — … sealed …`. `GET /cde/<key>/evidence-pack` still answers 200 with `"pack":"sentinel-audit-pack"`. The 2026-10-07 file `aster-tower-evidence-pack-2026-10-07.json` (the founder's download) gives `sealed(pack) === true` (`node -e` with `bridge/audit-pack.mjs`).
- **E-1** A lead: Files ▸ Evidence ▸ **Make the evidence pack** → `✓ Made the evidence pack evp-0001 — …`; its `storage_root` is the bridge's folder whatever the body says. `PUT /cde/<key>/artefacts/evidence_pack` → 400 `evidence packs change only through the evidence routes; nothing was saved`. `POST /cde/<office key>/evidence` (a lead of the office) → 400 `an evidence pack belongs to a project, not an office — make it on the project; nothing was saved`, and no pack is written there (that nothing is inherited from an office is Task 4 (c)'s unit test, not a live row). Settings ▸ Standards in force shows `evidence_pack` with no Install JSON….
- **E-2** A contributor admits before (a) and (c) → `Not done — a lead must sign (a) and (c) first; nothing was saved`, no row. The machine credential `POST …/attest {code:"a"}` → 403 `an attestation needs a person: sign in. Nothing was saved.`; a contributor → 403 `this action requires the lead role (you are contributor)`. A lead signs (a) and (c) → 2 `attestation:signed` rows, `text_sha256` `e5fdcf84…2546` and `f6103bd8…1bbc`. Admit `photos/own.jpg` now → `Not done — a lead must sign (d) first; nothing was saved`, no row. The machine credential `POST …/items` → 403 `an admission needs a person — … Nothing was saved.`. The lead signs (d) → a third row, `text_sha256` `6b4631ae…0f4a`.
- **E-3** Three files admitted (the LAS with method "registered in source", `photos/own.jpg`, and the RCP path with its report — by extension; a real ReCap project waits for an owner's scan) → 3 `evidence:admitted` rows **and** 3 `artefact_installed evidence_pack@5..7` rows (each evidence change is also the manifest's own version row — intended, counted both); the pack `evidence_pack@7` (make 1, sign 2-4, admit 5-7); the JPG's `attestation_ids` name (a), (c) and (d), the scans' (a) and (c); each `sha256` equals `certutil -hashfile <file> SHA256` (the LAS: `76c6b5e940d181f854719c2867a0565258622ae0b68485bfc4aa9f26a18d3c44`); the RCP line says `not surveyable (no ReCap here)`.
- **E-4** Edit one byte of `tiny.las`, **Re-check** → `Re-checked 3 item(s): 1 changed — scans/tiny.las (changed since admitted). On hold until …`; one `evidence:refused` row; On hold shows `scans/tiny.las` `refused by the evidence intake`. Re-run the script (the original bytes), **Admit** it (no registration form: a flagged item comes back as first admitted) → `✓ Admitted scans/tiny.las as ev-0001 …`, the row carries `readmitted: true`, and the hold clears.
- **E-5** `POST …/items {path:"photos/street.jpg", kind:"photo", provider:"google"}` (a file there, not admitted) → 200 refused, `google is a RED source — …`, one `evidence:refused photos/street.jpg` row, shown On hold. Then **Admit** `photos/street.jpg` from the web (provider left as own, (d) signed) → admitted, and its hold clears. The same google body on the admitted `photos/own.jpg` → 409 `… is already admitted as ev-0002 (Re-check finds a changed file) — nothing was saved`, no row, nothing On hold. `{path:"photos/none.jpg", kind:"photo", provider:"google"}` → 404 `no file …`, no row. `{path:"../x", kind:"photo"}` → 400 `path must name a file inside … — nothing was saved`, no row.
- **E-6** `POST /cde/<key>/audit {entity_type:"event", action:"evidence:admitted ev-0009 x"}` (machine) → 400 `evidence: rows are written by Sentinel, not through this route`; a lead's note `attestation:signed a evp-0001` → 400 `attestation: rows …`.
- **E-7** While E-3 runs, the drill bridge's own outbound connections are watched (`Get-NetTCPConnection -OwningProcess <4101 bridge pid>` polled every second, or `netstat -ano | findstr <pid>`; no admin needed): every remote address is loopback or the Supabase REST host — zero connections to That Open or any other host. The browser's network log shows JSON to the bridge only (no evidence bytes). Together with Task 5 (h)'s import check, this is the "no byte leaves the PC" proof; an absent log line is not.
- **E-8** A viewer sees the Evidence section read-only (no Sign, Admit or Re-check; `A contributor or above admits and re-checks — your role: viewer.`).
- Merge, restart the 4100 bridge on master (new routes and the rename), publish web 1.0.62 (the rename and the Evidence section), the design rows `:825-826` to LANDED with the drill's ledger ids, a secret scan of the range, push.

## Risks

- **Inline hashing.** A multi-GB file holds the request while it hashes (local SSD ~1-2 GB/s; a NAS less; the Funnel's request limits apply). Marked `ponytail:` in `hashFile`; MA-4h measures on 6.5 GB and moves it to a background job with a pending state if needed.
- **Two admissions at once** meet the create-only `evidence_pack@n` (`docInsert`): the loser gets the worded 409 and retries; nothing half-written. A recheck racing an admission is the same 409.
- **The row after the fold.** A pack version is written before its `evidence:*` / `attestation:signed` row; a failed ledger write leaves a version without its row (the route answers 500 and the bridge log says why). The same order as every artefact install.
- **`storage_root` names a folder on the office PC** (it may hold the Windows user name) and members can read it — D11 wants the folder named per office; a NAS path replaces it at the next write.
- **The audit pack now lists `evidence_pack`** under its standards (ref, source, sha only) — intended: the auditor sees the manifest's hash.
- **Two rows per evidence change.** Every signature, admission and flag writes the `attestation:`/`evidence:` row **and** an `artefact_installed evidence_pack@n` row (the manifest's own version record, `installVersion`), so the ledger and the audit pack show both; design §6.5 lists only the first. Intended; E-3 counts both.
- **Stored size grows with the square of the items.** Each change stores a whole new `evidence_pack@n+1` (kept forever, service key): ~550 bytes an item, so the 100-item cap ≈ 5,050 item copies ≈ 3 MB, where 500 would have been ≈ 65-70 MB. A `ponytail:` on `MAX_ITEMS` names the upgrade (a pack of item refs) before the cap is raised (MA-4h).
- **Re-check re-reads every admitted file** on the office PC's disk per click (GBs once real scans are in): budgeted at 6 per user and 12 in all a minute, and one run at a time per project (a second is a 409).
- **Items cannot be removed in MA-4a.** No delete, no withdraw; a flagged item stays flagged until the same bytes come back (a lead's dismissal clears the hold, not the flag). So evidence goes only on a project whose evidence is real (the drill uses `ma4a-drill`), and a re-scan goes in under a new path; retiring an item waits for MA-7.
- **The RED rule rests on (d).** The bridge refuses a RED `provider`, but a body can leave it out; a photo is admitted only after a lead signs (d), so the claim is a named person's on the ledger. The bridge cannot tell a Google capture from an own photo by its bytes.
- **Hold names are paths.** A container name and an evidence path cannot collide (no evidence format is `.ifc`); a lead's dismissal works on either.
- **The old `/evidence-pack` path** must be dropped after 1.0.62 is published (a `ponytail:` in the route says so).
- **A viewer sees file names** in the folder list (never contents) — the same as the files list they already read.

## Next (out of scope here)

- **MA-7** (with `delete_by` / `evidence:expired`) — retiring a flagged item, so a re-scan can take its path; until then it goes in under a new name.
- **MA-4b** — Ask the owner: `POST /cde/:key/evidence/requests` drafts a letter (sends nothing), `evidence:requested`; drawings (pdf/dwg/dxf/png/jpg) admitted with provider owner|architect|municipality, a drafted `request_id` and a signed (b).
- **MA-4c** — sentinel-survey v0.1 (numpy, plain LAS; 127.0.0.1 only) and the bridge's job supervisor (the first child process; the founder's OK), `build:run`; accepts only admitted, surveyable items of the pack in force.
- **MA-4d** — survey candidates to typed changesets per storey, evidence ids and job ids on gap groups and ledger rows, `measured` only from a bridge-run job, pre-tick within 20 mm.
- **MA-4e** — deviation (`POST /measure`, `verify:measured`). **MA-4f** — the decimated scan overlay in Revit. **MA-4g** — E57 and LAZ readers (four wheels, the founder's download OK). **MA-4h** — the Kladno drill (6.5 GB download OK; background hashing if the inline hash is too slow). **MA-4i** — the scan in the web desk (blocked on That Open's answers).

## Critique applied

Each finding was checked against the code at `616dc86` (members-store `requireSpend` :170-181, `myRole`/`requireMinRole` :145-162, cde-store `takeWriteBudget` :1235, holding-logic `walk` :22-52, bridge-fetch `bwrite` :78, files-panel :186-259, bimdocs-ingest :41-49, design :634-669, :825-826, :861, :869-886, :1124).

1. RED rule rests only on `provider` (important) — `ADMIT_NEEDS` is per kind `{scan: [a,c], photo: [a,c,d]}`; `newItem` puts (d)'s id on a photo; the validator requires the kind's codes; the 409 names the missing codes (`codesSaid`); the RED words say (d) covers every photo; evidence-store (b) and write-roles pin the photo 409 until (d); drill E-2 signs (d) before E-3's JPG; a Risks line says the rule rests on (d).
2. A pack on an office row (important) — `officeProject` refuses `proj.kind === "office"` with a 400 in words; evidence-store (f) and write-roles pin it; E-1's office row is now that 400 (no-inheritance stays Task 4 (c)'s unit test).
3. Policy refusals before the file and `prev` checks (important) — `runEvidenceIntake` reordered: 404 no file, then 409 already admitted (unflagged), then a new item's fields and the cap, then policy, then the hash; the dead "flag on admit" branch is gone (Re-check flags); E-5 and the write-roles RED case use `photos/street.jpg` (not admitted), and E-5 shows its hold clearing on admission.
4. A flagged RCP cannot be admitted again (important) — the scan-method and RCP-report rules moved from `readAdmitBody` to `newItemRefusal` (new items only); the web admits a flagged item with no form; evidence-store (d) restores and re-admits the RCP with no registration and expects the original `report_sha256`.
5. Drill on `aster-tower` (important) — the drill project is `ma4a-drill`, mandatory; a Risks line says items cannot be removed in MA-4a.
6. "Intake accepts evidence kinds" left standing (important) — Architecture names the separate route; Task 8 Step 3 adds the sub-bullet under design :1124.
7. Item shape vs §6.2 (minor) — Task 8 Step 3 adds the sentence after the §6.2 rules (`:666-669`).
8. Holds not in the design (minor) — Task 6 kept with the reorder; recorded as MA-4a spec amendment S2 (decision 12b, a note at Task 6, and Task 8's design edit).
9. E-7 cannot prove its claim; (h) greps one file (minor) — E-7 watches the bridge process's own connections (`Get-NetTCPConnection`/`netstat -ano`); (h) also checks every import specifier against an allow-list.
10. RCP proven only by extension (minor) — E-3 says so; a `ponytail:` on `FORMATS.rcp`.
11. Two ledger rows per change (minor) — a Risks line; E-3 counts both kinds (3 + 3) and the pack version is `@7`.
12. Quadratic storage at 500 items (important) — `MAX_ITEMS` is 100 with a `ponytail:` naming the growth and the upgrade path; pinned in evidence-logic (f) and evidence-store (g); Risks gives the figures.
13. Re-check unbudgeted and unguarded (important) — `takeWriteBudget("evidence rechecks", {perUser: 6, all: 12})` and a per-project in-flight `Set` (409 in words, released in `finally`); evidence-store (i) pins both; `hashFile`'s ponytail covers Re-check.
14. Already-admitted path put On hold (minor) — the same reorder as 3; evidence-store (c) pins the 409 with no row.
15. `requireSpend`'s words are wrong here (minor) — `requireMinRole(key, "contributor"|"lead")` then `officeProject`'s evidence words ending "nothing was saved"; write-roles expects `refused("contributor", "viewer")` for items and recheck.
16. `packOf` 404s lack "nothing was saved" (minor) — appended to both; evidence-store (f) and the web `readEvidence` test updated (the `/no evidence pack yet/` match still holds).
17. NTFS alternate streams (minor) — `safeRel` refuses any ":"; `"photos/a.jpg:x.las"` added to evidence-logic (b).
18. Task 9 grep would hit the comment (minor) — the `audit-pack.mjs` comment reworded ("a pack saved under its pre-MA-4a name"), so the pin is the only hit.
19. Machine credential as admitter (minor) — refused: a 403 "an admission needs a person … Nothing was saved." (decision 12c); write-roles and evidence-store (b) pin it; Re-check stays open to it.
20. A flagged item can never be replaced (minor) — Risks and Next (MA-7) say so; `itemLine`'s CHANGED words add "or put the new file in under a new name" (web test (c) updated).
21. `post()` re-implements `bwrite` (minor) — `post` is a one-line `bwrite` call; the web test mocks `bwrite` and `bfetch`.
22. Typed method ignored on re-admit (minor) — a flagged item is admitted with no form (`{path, kind}`), as in 4.
23. Anchors (minor) — `sourceFilePath (bimdocs-ingest.mjs:41-48)`; the `[data-gdismissok]` wiring ends at `:259`; the load catch is named as `:198` with its reset line `:201` (see below).

## Critique not taken

- **"Name it S6" (two S1s in one document).** The design already numbers amendments per slice — MA-2d's S1 (:345, :1088) and MA-3a's S1 (:942) coexist, each written with its slice. The plan keeps that convention and now writes "MA-4a spec amendment S1" (and S2) everywhere, which disambiguates without renumbering the design's history.
- **files-panel "catch at :198-200, not :201".** `:201` is the reset line inside that catch (`dismissing = null; renaming = null; …`), which is where `admitting = null;` belongs, so the anchor was right; the wording now names both `:198` and `:201`.
- **The optional 400 from `POST /cde/:key/intake` for a .las/.e57/.jpg.** Not built: the IFC intake already refuses a name not ending in .ifc with a 400 (`intake-logic.mjs:26`), and the design line is met by the amendment; adding a pointer there is a change to a route this slice leaves untouched.
