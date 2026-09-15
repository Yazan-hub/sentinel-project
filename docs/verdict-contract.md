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

**Server-side IDS wins.** If the bridge has `SENTINEL_IDS` configured, a client-supplied `ids` is
ignored and the response says so (`client_ids_ignored: true`, `ids_source: "server"`). A referee that
let the proposer bring its own rulebook would not be a referee.

## 2. Verdict

```jsonc
{
  "verdict": "accepted" | "rejected",
  "summary": { /* per-requirement counts */ },
  "failures": [ /* up to 200, each naming the requirement it failed */ ],
  "naming":  { "ok": false, "failures": [ … ] } | null,
  "warned": false,                    // failed, but the ruleset's enforce level is "warn"
  "ids_enforce": "reject" | "warn" | "off",
  "ids_source": "server" | "client" | "none" | "server-invalid",
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
  "ids_source": "server",
  "summary": { … },
  "agent": { "claimed": true, … } | null,
  "ledger_hash": "9f2c…",             // the audit row's OWN hash-chain entry
  "prev_hash":   "1ab7…"
}
```

The anchor is **the ledger's hash chain**, not a digest this code invents — and that chain is
truncate-proof at the Postgres core (migrations 0006/0015: UPDATE, DELETE and TRUNCATE are blocked by
triggers and least-privilege grants, so a compromised bridge or a DBA cannot rewrite it).

## 5. Verify — the part that matters

`POST /receipt/:project/verify` with `{ "receipt": … }`, or
`GET /receipt/:project/:auditId` for the authoritative one.

```jsonc
{ "matches": false,
  "reasons": ["verdict does not match the ledger (receipt: accepted, ledger: rejected)"],
  "ledger":  { /* the real receipt */ } }
```

Mismatches are **listed, not collapsed into a boolean**: "this receipt is forged" and "this receipt
is for a different verdict" are different conversations to have with a client. A ledger row with no
chain hash is reported as *unconfirmable* rather than confirmed — the hash is the only field the
database, rather than the caller, produced.

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
authoritative on the proposer's say-so would defeat its own purpose. It is built with
`createElement`, never `innerHTML`, so it is safe beside untrusted model data.

## 7. What this contract deliberately does not do

- It does not author anything. Sentinel has no opinion on how the elements were produced.
- It does not own cost or carbon data. The 5D/6D deltas are derivations at reference rates and
  factors, and every figure carries its basis (see `revision-delta.mjs`).
- It does not accept a client's rulebook when the server has one.
- It does not promise that a passing verdict means the building is right. It means the model
  satisfied the specification it was checked against, on the record, at a stated time.
