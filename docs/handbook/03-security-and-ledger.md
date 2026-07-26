# 03 · Security & the immutable ledger

Sentinel's product *is* trust, so security isn't a feature bolted on — it's the thing being sold. This page states the mechanism **and the current honest posture** (including what is fixed, what is built-but-not-armed, and what is still owed). The full record is `docs/SECURITY_AUDIT_2026-07.md`.

## The immutable audit ledger — how "on the record" is real

Every governed action (a proposal, a verdict, an ISO 19650 state change, a Revit publish) is appended to an **append-only, hash-chained `audit_log`**. This is the "golden thread." Its tamper-resistance is enforced at the **PostgreSQL core**, not in application code:

- **`BEFORE UPDATE OR DELETE` trigger** — any attempt to change or remove a ledger row is rejected. The record is append-only by construction.
- **`BEFORE TRUNCATE` trigger** — the table can't be emptied.
- **Hash chaining** — each row references the prior row's hash, so a silently altered or excised row breaks the chain and is detectable.
- **Least privilege + ownership** — write grants are revoked from the normal roles, and the table is owned by `postgres`, so **even the service key cannot drop the triggers** to get around it.

Status: ✅ **Verified** — the ledger's immutability holds even against the service_role key and the table owner (migration `0015`).

> Precise language matters here (a notary must not overstate): the ledger is **tamper-evident and tamper-resistant at the database core**. It is *not* "cryptographically unbreakable magic." An attacker with `postgres` superuser at the infrastructure level is out of scope — as it is for every database product.

## Row-Level Security (RLS)

Every project-data table has RLS enabled, scoped so an authenticated user only sees the projects they're a member of (`is_member(...)` / `has_min_role(...)`). The bridge forwards the user's JWT so the database — not the application — is the access boundary.

## Current honest posture (post-audit, 2026-07)

A full security audit was run (three adversarial passes + live-DB advisors + dependency/secret scans). Headline outcomes:

| Finding | Severity | Status |
|---|---|---|
| **F1** Anon-open RLS exposed cross-tenant data to the public key | CRITICAL | ✅ **Fixed & verified live** (migration `0016`; anon now denied, guarded by `npm run security:check`) |
| **F5** membership privilege-escalation · **F8** global-docs writable | HIGH/MED | ✅ Fixed (`0016`) |
| **F3** audit-trail actor could be spoofed | HIGH | ✅ Hardened (verified JWT identity now stamps the ledger) |
| **F10** PostgREST arg injection · **F9** unbounded-body DoS | MED | ✅ Fixed |
| **F2** bridge auth optional (could fall open to the service key) | HIGH | ✅ **Armed live 2026-07-26** — see `docs/SECURITY_F2_ACTIVATION.md`; HTTPS via Tailscale Serve (`docs/HOSTING_TAILSCALE.md`) |
| **F4** IDOR on id-addressed mutations | HIGH | ✅ Closed by existing RLS + the F2 gate (no extra code) |
| **F16** dev-only dependency CVEs | LOW | ✅ Accepted (dev toolchain only, zero production surface) |
| **F7** keystore offline-crack | MED | ✅ Mitigated (JWT-gated read + passphrase-strength gate) |
| **F14** `/sheets/img` path traversal | LOW | ✅ Fixed (resolve-prefix guard) |
| **F14** verbose 500 bodies · unbounded SSE | LOW | ✅ Fixed 2026-07-23 (scrubbed once in `send()`; `BCF_MAX_SSE` cap). SSE *project* authz still open — needs the JWT in a query string, which trades against F12 |
| **F11** `ACAO: *` on sheet/blob routes | MED | ✅ Fixed & verified 2026-07-23 (allowlisted-origin reflection on both binary routes) |
| **F13** snapshots not append-only | LOW | ✅ Fixed live 2026-07-23 (`0017`) — contributor+ gate + `BEFORE UPDATE` trigger; UPDATE rejected even for the service key, FK cascade intact |
| **Advisors** anon-callable RLS helpers | LOW | ✅ Fixed live 2026-07-23 (`0018`) — `project_of_container` no longer leaks container→project for anon |
| **F12** transport (HTTPS) | MED | ⬜ Triaged — a hosting change |

**Verified sound by the audit:** the immutable ledger, the hash chain, RLS coverage, pinned `search_path` on all functions (no injection), and the end-to-end crypto envelope (PBKDF2 @ 210k iterations, AES-256-GCM, fresh IVs, no fail-open). No secrets are in git history; the key shipped in the browser is the **public anon key** (safe by design — RLS is the real boundary).

## End-to-end encryption (the private CDE)

Files in the private CDE are encrypted **in the browser** under a per-project Data Encryption Key (DEK). The DEK is wrapped by a passphrase-derived key; only the *wrapped* DEK + salt live server-side (the "keystore"). The server never sees the passphrase, the key, or the plaintext — zero-knowledge. Status: 🟩 Built; the envelope scheme was ✅ verified sound in the audit.

## The one manual action still owed

Rotate the Supabase `service_role` keys + platform tokens and enable Supabase leaked-password protection (dashboard actions). *(As of 2026-07-21 the keys were rotated and the bridge re-validated; leaked-password protection is still to enable.)*
