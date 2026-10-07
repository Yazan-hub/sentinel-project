# BCF-API 3.0 conformance — Sentinel bridge (2026-10-08)

**What was checked.** buildingSMART publishes no runnable test suite for the BCF-API; its repository
(`buildingSMART/BCF-API`) holds the specification, an OpenAPI reference and the JSON schemas of every request and
response. Conformance is therefore proved against those schemas: `WebApp/bridge/bcf-conformance.mjs` walks the surface a
reading BCF client uses and validates each response against the official schema of its route (the schemas vendored
unchanged under `WebApp/bridge/fixtures/bcf-api-schemas/`, CC BY-ND 4.0, with a notice). The schemas are JSON Schema
draft-03; the validator covers the dialect's features the schemas use — `type` (and type lists), `required: true` on a
property, `properties`, `items`, `enum`, `minItems`, relative `$ref` — and nothing more.

**Run.** `node bridge/bcf-conformance.mjs http://127.0.0.1:4100 aster-tower` on 2026-10-08, the bridge at `736ce7a`, the
machine credential from loopback, the real `aster-tower` project (62 projects visible, 2 live containers, topics with one
viewpoint).

| Route | Status | Result |
|---|---|---|
| versions | 200 | ✅ conforms |
| auth | 200 | ✅ conforms |
| current-user | 200 | ✅ conforms |
| projects | 200 | ✅ conforms |
| project | 200 | ✅ conforms |
| extensions | 200 | ✅ conforms |
| files | 200 | ✅ conforms |
| documents | 200 | ✅ conforms |
| topics | 200 | ✅ conforms |
| events | 200 | ✅ conforms |
| topic | 200 | ✅ conforms |
| topic events | 200 | ✅ conforms |
| comments | 200 | ✅ conforms |
| viewpoints | 200 | ✅ conforms |
| related topics | 200 | ✅ conforms |
| document references | 200 | ✅ conforms |
| viewpoint selection | 200 | ✅ conforms |
| viewpoint coloring | 200 | ✅ conforms |
| viewpoint visibility | 200 | ✅ conforms |
| error (unknown topic) | 404 | ✅ conforms |

**20 conform, 0 do not, 0 skipped.** Through the Funnel with no bearer, `/bcf/versions` and `/bcf/3.0/auth` answer `200`
(the auth document's URLs on the Funnel host, https) and `/bcf/3.0/projects` is `401` — the public surface is exactly
the specification's §3 set.

**What the run changed first.** The schemas found four shape gaps in slice 1–2's output, all fixed before this run:
`topic_GET` requires `server_assigned_id` (now the guid, additive on every topic listed or read); `comment_GET` requires
`topic_guid` (added); the files list is `project_files_information_GET` (`display_information` + `file.filename`), not a
flat `file_GET` with `file_name`; topic events carry `actions`, not `events`; and a viewpoint's `snapshot` is
`{ snapshot_type }` (the bytes come from `…/snapshot`), not the stored image.

**What this does not claim.**
- `versions` and `auth` have no schema in the repository; their shapes are read from the specification's text.
- The writes (`POST`/`PUT`/`DELETE`) are covered by the bridge's own tests (`write-roles.test.mjs`), not by this walk — the
  repository's `*_POST`/`*_PUT` schemas describe request bodies, which the bridge validates in words of its own.
- A conformance *listing* by buildingSMART needs an implementer's registration and a review by the BCF Implementers
  Group — the founder's step; this page is the evidence to bring.
- A stock BCF client on the Funnel URL (BIMcollab Zoom, Solibri) with a person's own sign-in through the consent page
  remains the founder's live check (Session OPEN2's owed row).

**Re-run.** Any time: `cd WebApp && node bridge/bcf-conformance.mjs <base> <project key>` (`BCF_BEARER=<a person's JWT>`
in the environment for a run through the Funnel; otherwise the machine credential from `config/.env` on loopback). The
offline half runs with the suite: `bridge/bcf-conformance.test.mjs`.
