# The Sentinel verdict contract (`sentinel-verdict/1`)

*The public surface. Everything here is deliberately checkable by someone who does not trust the
person showing it to them.*

Sentinel's bet is that the market is about to be full of tools that **propose** — agents writing IFC,
models detailing in Revit, generators producing families — and short of anything that can say *and
here is the proof it was allowed*. That proof is only worth anything if calling it is trivial from
somebody else's application, and if the answer can be re-checked by a third party. Hence this
contract and the single-file client beside it.

Nothing in this document is privileged. Sentinel is the referee, not the author, and a referee whose
rulebook is private is just an opinion.

---

## 1. Propose

`POST /cde/:project/propose`

```jsonc
{
  "elements": [                       // the ElementProperties shape
    { "identity": { "Class": "IFCWALL", "GlobalId": "1a2b…", "Name": "EXT-200" },
      "psets": [{ "name": "Pset_WallCommon", "rows": [{ "name": "FireRating", "value": "REI60" }] }] }
  ],
  "ids": { "title": "…", "specifications": [ /* … */ ] },   // omit to use the server's configured spec
  "container_name": "PRJ-BDS-XX-XX-M3-A-0001",              // optional: also runs the naming gate
  "source": "my-tool",
  "agent": {                          // CLAIMED provenance — see §3
    "kind": "agent", "model": "gpt-6-astra", "tool": "revit-mcp",
    "prompt": "model the stair core to LOD300"              // hashed bridge-side, never stored
  },
  "note": "optional"
}
```

**The project's installed IDS wins.** If the project (or its office) has an `ids` artefact, a client-supplied `ids` is ignored and `client_ids_ignored: true` is recorded; `ids_source` is `project | office | client | none` and `ids_ref` names the version.

## 2. Verdict

```jsonc
{
  "verdict": "accepted" | "rejected" | "recorded",   // recorded = nothing was adjudicated (no IDS, or nothing in scope)
  "summary": { "elements": 412, "in_scope": 96, "passing": 96, "failing": 0, "ids": "Aster IDS" },
  "failures": [ /* up to 200, each naming the requirement it failed */ ],
  "naming":  { "ok": false, "failures": [ … ] } | null,
  "warned": false,                    // failed, but the ruleset's enforce level is "warn"
  "ids_enforce": "reject" | "warn" | "off",
  "ids_source": "project" | "office" | "client" | "none",
  "ids_ref": "ids@3" | null,          // the installed artefact version that judged
  "ids_sha256": "4c1e…" | null,       // hash of the spec body that judged (computed, never copied)
  "audit_id": 412,
  "agent": { "claimed": true, … } | null,
  "receipt": { /* §4 */ }
}
```

`ids_source: "none"` means **nothing was actually checked**. It is reported rather than dressed up:
a verdict with no specification behind it is a record, not an adjudication, and the compliance layer
treats it that way too (`ids.last_verdict` returns *not checkable*, never *met*).

## 3. Provenance is claimed, never verified

The `agent` block is stored under `claimed: true` because Sentinel **cannot** verify that the caller
is the model it says it is. Any surface rendering it must say so. A provenance field that read as
verified would be worse than no provenance at all, because it would be believed.

The **prompt is hashed, not stored**. A prompt can carry a client's confidential brief, and the
ledger is append-only and immutable — the wrong place to discover that. The digest still proves
"this verdict came from exactly that instruction" whenever the instruction is produced later.

## 4. The receipt

```jsonc
{
  "version": "sentinel-receipt/1",
  "project": "bds",
  "audit_id": 412,
  "recorded_at": "2026-09-15T10:00:00.000Z",
  "actor": "agent",
  "verdict": "accepted",
  "ids_source": "project",
  "summary": { … },
  "agent": { "claimed": true, … } | null,
  "ledger_hash": "9f2c…",             // the audit row's OWN hash-chain entry
  "prev_hash":   "1ab7…"              // the previous row's hash in the WHOLE ledger — often another project's
}
```

The anchor is **the ledger's hash chain**, not a digest this code invents. It is **one chain for the
whole ledger, not one per project**: each row's hash covers the previous row's hash — whichever project
wrote that row — and the row's own `entity_type`, `entity_id`, `action`, `actor`, `old_value`,
`new_value` and `at` (migration 0006); the row's `id` and `project_id` are not in the hash. The ledger
is append-only at the Postgres core (migrations 0002/0015: UPDATE, DELETE and TRUNCATE are blocked by
triggers and least-privilege grants, so a bridge holding the service key cannot rewrite it; a database
superuser is outside that guarantee, as for any database). Nothing in Sentinel recomputes the chain at
runtime: a receipt is checked against the hash the ledger stored (§5).

## 5. Verify — the part that matters

`POST /receipt/:project/verify` with `{ "receipt": … }`, or
`GET /receipt/:project/:auditId` for the authoritative one. The POST answers two kinds of caller.

**A member** — the bridge's bearer token, or a signed-in member's session — gets the full reply, as
before (the MCP tool `sentinel_verify_receipt` is one):

```jsonc
{ "matches": false,
  "reasons": ["verdict does not match the ledger (receipt: accepted, ledger: rejected)"],
  "ledger":  { /* the real receipt */ } }
```

Mismatches are **listed, not collapsed into a boolean**: "this receipt is forged" and "this receipt
is for a different verdict" are different conversations to have with a client. A ledger row with no
chain hash is reported as *unconfirmable* rather than confirmed — the hash is the only field the
database, rather than the caller, produced.

**Anyone else** — no token, from any web page — sends the receipt, or just `{ "audit_id": 702,
"ledger_hash": "<64 hex>" }` with `recorded_at`, `verdict` and `project` if it has them; only those
five fields are read. The reply names fields and never carries a ledger value:

```jsonc
{ "matches": false,
  "checked":     ["audit_id", "ledger_hash", "project", "verdict"],  // compared (names only)
  "mismatched":  ["verdict"],                                        // compared and different
  "not_checked": ["recorded_at"],                                    // not sent: never counted as a pass
  "note": "…" }
```

`matches: true` needs the id, the hash and the project to match, and every field that was sent to
match; its note reads "matches the ledger's stored hash; the chain is not recomputed". An unknown
project key, an unknown id, a row of another project, a wrong hash and a row with no chain hash all
get the same bytes, so the answer says nothing about which keys or ids exist:

```json
{"matches":false,"note":"no ledger entry on this key has that id and hash"}
```

A malformed body — an id that is not an integer, a hash that is not 64 lowercase hex — is a 400
before any read; a body over 8 KB is a 413; past 60 anonymous checks a minute (one window for every
caller together, not per address) the answer is a 429. This path alone answers
`Access-Control-Allow-Origin: *`, without credentials; the bridge logs the method, the path and the
outcome of an anonymous check, never its body. `GET /receipt/…` and every `/cde` route still need
the bearer.

**What a match does not say.** The check compares the hash the ledger stored for that row; it does not
recompute the hash or walk the chain. And because the chain runs across projects (§4), a receipt's
`prev_hash` is often another project's row: someone holding it and that project's key can confirm one
bit — "row N on that key has this hash" — and learn nothing else. Removing that needs per-project
chaining, a migration Sentinel has not made.

## 6. The client

`bridge/public-client/sentinel-verify.mjs` — one file, zero dependencies, no build step.

```html
<script type="module">
  import { Sentinel, verdictBadge } from "./sentinel-verify.mjs";
  const s = new Sentinel({ baseUrl: "http://127.0.0.1:4100", project: "bds" });

  const verdict = await s.propose({ elements, agent: { kind: "agent", model: "gpt-6", prompt } });
  const check   = await s.verify(verdict.receipt);       // do not take the proposer's word for it
  document.body.append(verdictBadge(verdict.receipt, check));
</script>
```

`verdictBadge` renders **UNVERIFIED** until `verify()` has confirmed the receipt. A badge that looked
authoritative on the proposer's say-so would defeat its own purpose. It shows a verdict only when the
check compared it (`verdict` in the reply's `checked`); a receipt confirmed on its id and hash alone
reads "on the ledger — verdict not checked", and a confirmed badge's title says the entry "matches the
ledger's stored hash (chain not recomputed)". It is built with `createElement`, never `innerHTML`, so
it is safe beside untrusted model data.

## 7. What this contract deliberately does not do

- It does not author anything. Sentinel has no opinion on how the elements were produced.
- It does not own cost or carbon data. The 5D/6D deltas are derivations at reference rates and
  factors, and every figure carries its basis (see `revision-delta.mjs`).
- It does not accept a client's rulebook when the server has one.
- It does not promise that a passing verdict means the building is right. It means the model
  satisfied the specification it was checked against, on the record, at a stated time.
