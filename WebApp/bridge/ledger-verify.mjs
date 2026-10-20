// Sentinel ledger verifier — for an auditor, offline, on a project's downloaded audit pack. One file, Node 18 or later, nothing to
// install (node:crypto and node:tls only). Run:
//
//   node ledger-verify.mjs <key>-audit-pack-<date>.json [--root extra-root.pem] [--expect <seq>:<hash>] [--trust-system-roots]
//
// It checks, and says in words (PASS / FAIL / NOTE per line; exit 0 only when nothing failed):
//   1 · the seal — bundle_sha256 is the sha256 of the pack without it, keys sorted at every level (not a signature: it shows the
//       file was not changed after it was made);
//   2 · the project's chain (migration 0045) — each row's project_hash is the sha256 of the text chainPreimage() builds from that
//       row and the hash before it, and project_seq runs 1, 2, 3 … with no gap. Only this project's rows are needed. The chain is
//       the pack's project's, and the readable ledger list is the chain's own rows;
//   3 · every external timestamp in the chain (rows anchor:timestamped) — an RFC 3161 token whose imprint is the project_hash at the
//       seq the row names, signed (the signed attributes' digest of the token's content, then the signature) by the certificate the
//       token binds itself to (ESS signing certificate): one critical time-stamping key usage, valid at the stamped time, from a
//       timestamp authority this file pins (PINNED_TSAS, under its root in this Node's built-in list) or under a root given with
//       --root; and the token's time is when its row was written. Revocation is not checked: that needs the network.
//   4 · --expect <seq>:<hash> (from a pack you were sent before): this chain still holds that hash at that seq.
// What a timestamp proves: the rows before it existed by its time. The operator holds the database; what they cannot do after a
// timestamp is change the rows before it without the token failing — unless every later pack's tokens are made again, which
// --expect (an earlier pack's head) and the token-time check catch.
//
// The bridge uses the same functions to check a token when it is received and when the Settings screen shows it.
import { createHash, X509Certificate, verify as cryptoVerify } from "node:crypto";
import { rootCertificates } from "node:tls";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ── The pack's seal (the audit pack's own, paperwork slice 5) ──────────────────────────────────────────────────────────────────
/** Deterministic JSON (keys sorted at every level) — the bytes the pack's sha256 is taken over. Pure. */
export const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
/** The bundle with its sha256: `bundle_sha256` is over the canonical body without that field. Pure. */
export function seal(body) {
  const { bundle_sha256: _drop, ...rest } = body ?? {};
  return { ...rest, bundle_sha256: createHash("sha256").update(canonical(rest)).digest("hex") };
}
/** True when a sealed pack's sha256 matches its body. Pure. */
export const sealed = (pack) => !!pack?.bundle_sha256 && seal(pack).bundle_sha256 === pack.bundle_sha256;

// ── The project chain (migration 0045: cde_chain_field, cde_project_chain_preimage) ────────────────────────────────────────────
const field = (x) => x == null ? "-\n" : `${Buffer.byteLength(String(x), "utf8")}:${x}\n`;
/** The text a chain row's project_hash is the sha256 of. `r` is a row of audit_project_chain_v; `prev` the previous row's
 *  project_hash (null for seq 1). Pure. */
export const chainPreimage = (r, prev) => "sentinel-project-chain/1\n" +
  [r.project_id, r.project_seq, prev, r.audit_id, r.hash, r.entity_type, r.entity_id, r.action, r.actor, r.old_text, r.new_text, r.at_utc]
    .map((x) => field(x == null ? x : String(x))).join("");
export const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Recomputes a project's chain from seq 1. { ok, length, head: {project_seq, project_hash} | null, problems[], hashes: Map seq→hash }.
 *  A gap, a duplicate seq, a row of another project, or a hash that is not the recomputed one is a problem. Pure. */
export function verifyChain(rows) {
  const problems = []; const hashes = new Map();
  const sorted = [...(rows ?? [])].sort((a, b) => Number(a.project_seq) - Number(b.project_seq));
  let prev = null; let head = null;
  for (const [i, r] of sorted.entries()) {
    const seq = Number(r.project_seq);
    if (seq !== i + 1) { problems.push(`row ${i + 1} of the chain carries seq ${r.project_seq}: a row is missing or repeated before it`); break; }
    if (r.project_id !== sorted[0].project_id) problems.push(`seq ${seq} names another project (${r.project_id})`);
    const want = sha256hex(chainPreimage(r, prev));
    if (want !== r.project_hash) problems.push(`seq ${seq} (ledger #${r.audit_id}): its project_hash is not the hash of its text — the row or one before it was changed`);
    hashes.set(seq, want); prev = want; head = { project_seq: seq, project_hash: want };
  }
  return { ok: problems.length === 0, length: sorted.length, head, problems, hashes };
}

// ── DER, as much as an RFC 3161 token needs ────────────────────────────────────────────────────────────────────────────────────
/** One TLV at `at`: { tag, body, all, end }. Throws on a truncated or malformed length. */
export function tlv(buf, at = 0) {
  const tag = buf[at]; let len = buf[at + 1]; let off = at + 2;
  if (tag === undefined || len === undefined) throw new Error("DER: truncated");
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4 || off + n > buf.length) throw new Error("DER: bad length");
    len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[off + i];
    off += n;
  }
  if (off + len > buf.length) throw new Error("DER: truncated");
  return { tag, body: buf.subarray(off, off + len), all: buf.subarray(at, off + len), end: off + len };
}
/** The TLVs inside a constructed one. */
export const kids = (t) => { const out = []; for (let p = 0; p < t.body.length;) { const k = tlv(t.body, p); out.push(k); p = k.end; } return out; };
/** An OBJECT IDENTIFIER's dotted text. */
export const oid = (t) => {
  const ids = []; let v = 0;
  for (const x of t.body) { v = v * 128 + (x & 0x7f); if (!(x & 0x80)) { ids.push(v); v = 0; } }
  const f = ids.shift();
  return [f < 40 ? 0 : f < 80 ? 1 : 2, f < 80 ? f % 40 : f - 80, ...ids].join(".");
};
const intHex = (t) => Buffer.from(t.body).toString("hex").replace(/^(00)+(?=.)/, "");
const genTime = (t) => {
  const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\.\d+)?Z$/.exec(Buffer.from(t.body).toString("latin1"));
  if (!m) throw new Error("the token's time is not a UTC GeneralizedTime");
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`;
};

const OID = {
  signedData: "1.2.840.113549.1.7.2", tstInfo: "1.2.840.113549.1.9.16.1.4",
  contentType: "1.2.840.113549.1.9.3", messageDigest: "1.2.840.113549.1.9.4",
  signingCert: "1.2.840.113549.1.9.16.2.12", signingCertV2: "1.2.840.113549.1.9.16.2.47",
  timeStamping: "1.3.6.1.5.5.7.3.8",
};
// sha1 only for ESS v1's certificate hash (the binding RFC 2634 defines); never for the signed digest or the signature
const DIGEST = { "1.3.14.3.2.26": "sha1", "2.16.840.1.101.3.4.2.1": "sha256", "2.16.840.1.101.3.4.2.2": "sha384", "2.16.840.1.101.3.4.2.3": "sha512" };
// signature algorithm → the digest it signs with (null: the SignerInfo's digestAlgorithm)
const SIG = {
  "1.2.840.113549.1.1.1": null, "1.2.840.113549.1.1.11": "sha256", "1.2.840.113549.1.1.12": "sha384", "1.2.840.113549.1.1.13": "sha512",
  "1.2.840.10045.4.3.2": "sha256", "1.2.840.10045.4.3.3": "sha384", "1.2.840.10045.4.3.4": "sha512",
};

// The timestamp authorities this verifier trusts by default: a TSA's own certificate (subject organisation) under its pinned root
// from Node's built-in list. A web root alone is not enough — any public CA sells time-stamping certificates to anyone, so a
// certificate bought by the operator would let them stamp any time they like. --root <pem> trusts that root's TSAs (an auditor's
// explicit choice); --trust-system-roots trusts any TSA under any built-in root (said in the output).
export const PINNED_TSAS = [{ name: "DigiCert", org: "DigiCert, Inc.", root: "DigiCert Trusted Root G4" }];

/** A certificate's extensions from its DER: Map oid → { critical }. */
const extensionsOf = (der) => {
  const tbs = kids(kids(tlv(der))[0]);
  const box = tbs.find((t) => t.tag === 0xa3);
  return new Map((box ? kids(kids(box)[0]) : []).map((e) => { const k = kids(e); return [oid(k[0]), { critical: k[1]?.tag === 0x01 && k[1].body[0] !== 0 }]; }));
};
// Node escapes a comma in a name ("DigiCert\, Inc."): read the name as written in the certificate.
const org = (c) => (/(?:^|\n)O=([^\n]*)/.exec(c.subject) ?? [])[1]?.replace(/\\(.)/g, "$1") ?? null;

/** The parts of a TimeStampToken (CMS SignedData over a TSTInfo) a check needs. Throws on a token it cannot read. */
export function readToken(der) {
  const [ctype, ctx] = kids(tlv(der));
  if (oid(ctype) !== OID.signedData) throw new Error("not a CMS SignedData");
  const sd = kids(tlv(ctx.body));
  const [eType, eCtx] = kids(sd[2]);
  if (oid(eType) !== OID.tstInfo) throw new Error("the signed content is not a TSTInfo");
  const tstDer = tlv(eCtx.body).body;
  const certs = sd.filter((p) => p.tag === 0xa0).flatMap((p) => kids(p).map((c) => Buffer.from(c.all)));
  const si = kids(kids(sd[sd.length - 1])[0]);
  let i = 2;
  const digestAlg = oid(kids(si[i++])[0]);
  const attrs = si[i].tag === 0xa0 ? si[i++] : null;
  const sigAlg = oid(kids(si[i++])[0]);
  const signature = Buffer.from(si[i].body);
  const t = kids(tlv(tstDer));
  const [mAlg, mHash] = kids(t[2]);
  const attr = {};
  for (const a of attrs ? kids(attrs) : []) { const [o, set] = kids(a); attr[oid(o)] = kids(set)[0]; }
  const nonce = t.slice(5).find((x) => x.tag === 0x02);
  return {
    policy: oid(t[1]), imprintAlg: oid(kids(mAlg)[0]), imprint: Buffer.from(mHash.body).toString("hex"),
    serial: intHex(t[3]), gen_time: genTime(t[4]), nonce: nonce ? intHex(nonce) : null,
    tstDer: Buffer.from(tstDer), certs, digestAlg, sigAlg, signature, attr,
    signedBytes: attrs ? Buffer.concat([Buffer.from([0x31]), attrs.all.subarray(1)]) : null,
  };
}

const cn = (c) => (/(?:^|\n)CN=([^\n]*)/.exec(c.subject) ?? [])[1]?.replace(/\\(.)/g, "$1") ?? c.subject;
let ROOTS = null;
const builtInRoots = () => (ROOTS ??= rootCertificates.map((p) => new X509Certificate(p)));
/** Every certificate in a PEM text. */
export const pemCerts = (text) => (String(text).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((p) => new X509Certificate(p));

/** Checks a TimeStampToken (DER) against the hash it should fix in time (64 hex). opts: { nonce (hex), extraRoots: X509Certificate[],
 *  builtIn: false to trust only extraRoots, trustSystemRoots: true to trust any TSA under a built-in root }.
 *  → { ok, problems[], gen_time, tsa, tsa_org, signer_sha256, trust, policy, serial, chain[] }. Never throws. */
export function verifyToken(der, expectHex, opts = {}) {
  const problems = []; let tok;
  try { tok = readToken(Buffer.from(der)); } catch (e) { return { ok: false, problems: [`the token could not be read: ${e.message}`], gen_time: null, tsa: null, chain: [] }; }
  const out = { gen_time: tok.gen_time, policy: tok.policy, serial: tok.serial, tsa: null, chain: [] };
  if (DIGEST[tok.imprintAlg] !== "sha256") problems.push(`the token fixes a ${DIGEST[tok.imprintAlg] ?? tok.imprintAlg} hash, not sha256`);
  if (tok.imprint !== String(expectHex).toLowerCase()) problems.push(`the token fixes ${tok.imprint.slice(0, 12)}…, not ${String(expectHex).slice(0, 12)}…`);
  if (opts.nonce != null && tok.nonce !== String(opts.nonce).replace(/^(00)+(?=.)/, "")) problems.push("the token's nonce is not the one asked with");
  const dAlg = DIGEST[tok.digestAlg];
  if (!tok.signedBytes) problems.push("the token carries no signed attributes");
  else if (!dAlg || dAlg === "sha1") problems.push(`the token is signed over ${dAlg ?? tok.digestAlg}, which this verifier does not accept`);
  else {
    if (!tok.attr[OID.contentType] || oid(tok.attr[OID.contentType]) !== OID.tstInfo) problems.push("the signed content type is not TSTInfo");
    const md = tok.attr[OID.messageDigest];
    if (!md || !createHash(dAlg).update(tok.tstDer).digest().equals(Buffer.from(md.body))) problems.push("the signed digest is not the digest of the token's content — the content was changed");
  }
  // The signer: the certificate the token binds itself to (ESS signingCertificate[V2]: a hash of the certificate).
  try {
    const v2 = tok.attr[OID.signingCertV2]; const v1 = tok.attr[OID.signingCert];
    if (!v2 && !v1) throw new Error("no ESS signing certificate attribute");
    const ess = kids(kids(kids(v2 ?? v1)[0])[0]);
    const hasAlg = !!v2 && ess[0].tag === 0x30;
    const alg = hasAlg ? DIGEST[oid(kids(ess[0])[0])] : v2 ? "sha256" : "sha1";
    if (!alg) throw new Error("the ESS certificate hash algorithm is unknown");
    const want = Buffer.from((hasAlg ? ess[1] : ess[0]).body);
    const pool = tok.certs.map((d) => new X509Certificate(d));
    const signer = pool.find((c) => createHash(alg).update(c.raw).digest().equals(want)) ?? null;
    if (!signer) throw new Error("the token does not carry the certificate it names as its signer");
    out.tsa = cn(signer); out.tsa_org = org(signer);
    out.signer_sha256 = createHash("sha256").update(signer.raw).digest("hex");
    const algName = SIG[tok.sigAlg] === undefined ? undefined : (SIG[tok.sigAlg] ?? dAlg);
    if (!algName || algName === "sha1") problems.push(`signature algorithm ${tok.sigAlg} is not one this verifier checks`);
    else if (tok.signedBytes && !cryptoVerify(algName, tok.signedBytes, signer.publicKey, tok.signature)) problems.push("the signature does not verify against the signer's certificate");
    // RFC 3161 §2.3: the TSA's certificate has exactly one extended key usage, time-stamping, and marks it critical.
    const eku = signer.extKeyUsage ?? signer.keyUsage ?? [];
    if (!(eku.length === 1 && eku[0] === OID.timeStamping && extensionsOf(signer.raw).get("2.5.29.37")?.critical)) problems.push("the signer's certificate is not a time-stamping certificate (one critical extended key usage: time-stamping)");
    const at = Date.parse(tok.gen_time);
    const extra = opts.extraRoots ?? [];
    const roots = [...(opts.builtIn === false ? [] : builtInRoots()), ...extra];
    const chain = [signer]; let cur = signer; let anchor = null;
    for (let n = 0; n < 8; n++) {
      anchor = roots.find((r) => r.ca && cur.checkIssued(r) && cur.verify(r.publicKey)) ?? null;
      if (anchor) break;
      const up = pool.find((c) => !chain.includes(c) && c.ca && cur.checkIssued(c) && cur.verify(c.publicKey));
      if (!up) break;
      chain.push(up); cur = up;
    }
    out.chain = [...chain, ...(anchor && anchor.fingerprint256 !== cur.fingerprint256 ? [anchor] : [])].map(cn);
    if (!anchor) problems.push(`the signer's certificate does not chain to a trusted root (${out.chain.join(" ← ")})`);
    else if (extra.some((r) => r.fingerprint256 === anchor.fingerprint256)) out.trust = `a root given with --root (${cn(anchor)})`;
    else if (opts.trustSystemRoots) out.trust = `any TSA under a root in Node's built-in list (--trust-system-roots): ${cn(anchor)}`;
    else {
      const pin = PINNED_TSAS.find((p) => p.root === cn(anchor) && p.org === out.tsa_org);
      if (pin) out.trust = `${pin.name}'s own timestamp service (${pin.org}, under ${pin.root})`;
      else problems.push(`"${out.tsa_org ?? out.tsa}" under "${cn(anchor)}" is not a timestamp authority this verifier trusts by default (${PINNED_TSAS.map((p) => p.name).join(", ")}) — an auditor who trusts it passes its root with --root`);
    }
    for (const c of anchor ? [...chain, anchor] : chain) {
      if (!(Date.parse(c.validFrom) <= at && at <= Date.parse(c.validTo))) problems.push(`certificate "${cn(c)}" was not valid at ${tok.gen_time}`);
    }
  } catch (e) { problems.push(`the signer could not be checked: ${e.message}`); }
  return { ok: problems.length === 0, problems, ...out };
}

// ── A whole pack ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
/** The anchor rows of a chain: { row, value } for each anchor:timestamped row. Pure. */
export const anchorRows = (rows) => (rows ?? []).filter((r) => r.entity_type === "ledger_anchor" && r.action === "anchor:timestamped").map((row) => ({ row, value: parse(row.new_text) ?? {} }));

/** One anchor row against a chain already recomputed (verifyChain's result): the seq and hash it names, its token, and its time —
 *  the token's time must be when the row was written (a token made later and filed into an older-looking row, or the reverse,
 *  fails). → verifyToken's result plus { seq }, with every problem in `problems`. Pure but for the clock-free token check. */
export function checkAnchor(row, v, c, opts = {}) {
  const seq = Number(v.project_seq);
  const at = c.hashes.get(seq);
  if (!at) return { ok: false, seq, problems: [`it names seq ${v.project_seq}, which is not in this chain`] };
  if (at !== v.project_hash) return { ok: false, seq, problems: [`it names a hash that is not the chain's at seq ${seq}`] };
  if (seq >= Number(row.project_seq)) return { ok: false, seq, problems: [`it names seq ${seq}, which is not before its own row (seq ${row.project_seq})`] };
  const r = verifyToken(Buffer.from(String(v.token ?? ""), "base64"), at, opts);
  const gen = Date.parse(r.gen_time ?? ""), wrote = Date.parse(row.at_utc ?? "");
  // the bridge writes the row right after the token comes back: allow 5 min of clock difference after, an hour before
  if (r.gen_time && !(gen <= wrote + 5 * 60e3 && gen >= wrote - 3600e3)) r.problems.push(`the token's time ${r.gen_time} is not when its row was written (${row.at_utc})`);
  return { ...r, ok: r.problems.length === 0, seq };
}

/** Checks a downloaded audit pack. opts as verifyToken's, plus expect: [{ seq, hash }] (hashes an auditor already holds, from an
 *  earlier pack). → { ok, lines[], last_timestamp: { project_seq, gen_time, tsa } | null }. */
export function verifyPack(pack, opts = {}) {
  const lines = []; let ok = true;
  const pass = (good, text) => { lines.push(`${good ? "PASS" : "FAIL"}  ${text}`); if (!good) ok = false; };
  const note = (text) => lines.push(`NOTE  ${text}`);
  pass(sealed(pack), sealed(pack) ? `the pack's seal ${pack.bundle_sha256.slice(0, 12)}… matches its content (a seal shows the file was not changed after it was made; it is not a signature)` : "the pack's seal does not match its content — the file was changed after it was made");
  const chain = pack?.chain;
  if (!chain || !Array.isArray(chain.rows)) { pass(false, `the pack carries no project chain${chain?.not_read ? ` (${chain.not_read})` : ""}`); return { ok, lines, last_timestamp: null }; }
  const c = verifyChain(chain.rows);
  for (const p of c.problems) pass(false, p);
  if (c.ok) pass(true, `the project chain: ${c.length} row(s), seq 1 to ${c.length}, every hash recomputed; head ${c.head?.project_hash.slice(0, 12) ?? "—"}…`);
  if (chain.truncated) note(`the pack holds the first ${c.length} of ${chain.length} chain rows (cut at the cap): rows after seq ${c.length} are not checked here`);
  const pid = pack.project?.id;
  if (!pid) note("the pack does not name its project's id (made before 2026-10-20), so the chain's project is not compared with it");
  else pass(chain.rows.every((r) => r.project_id === pid), chain.rows.every((r) => r.project_id === pid) ? `the chain is this project's (${pid})` : `the chain names another project than the pack's (${pid})`);
  for (const e of opts.expect ?? []) {
    const h = c.hashes.get(Number(e.seq));
    pass(h === String(e.hash).toLowerCase(), h === String(e.hash).toLowerCase() ? `seq ${e.seq} is the hash you hold (${h.slice(0, 12)}…): this chain extends the one you had` : `seq ${e.seq} is ${h ? `${h.slice(0, 12)}…` : "not in this chain"}, not the hash you hold (${String(e.hash).slice(0, 12)}…) — the history you were given before was changed`);
  }
  // The readable ledger list must be the chain's own rows, word for word.
  const led = pack.ledger?.rows;
  if (Array.isArray(led) && c.ok) {
    const byId = new Map(chain.rows.map((r) => [Number(r.audit_id), r]));
    const off = [];
    for (const l of led) {
      const r = byId.get(Number(l.id));
      if (!r) { if (!chain.truncated) off.push(`ledger #${l.id} is in the readable list but not in the chain`); continue; }
      for (const k of ["entity_type", "entity_id", "action", "actor", "hash"]) if ((l[k] ?? null) !== (r[k] ?? null)) off.push(`ledger #${l.id}: the readable list's ${k} is not the chain's`);
      if (Date.parse(l.at) !== Date.parse(r.at_utc)) off.push(`ledger #${l.id}: the readable list's time is not the chain's`);
    }
    for (const o of off.slice(0, 20)) pass(false, o);
    if (off.length > 20) pass(false, `… and ${off.length - 20} more differences between the readable list and the chain`);
    if (!off.length) pass(true, `the readable ledger list (${led.length} row(s)) is the chain's own rows`);
  }
  let last = null;
  const anchors = anchorRows(chain.rows);
  const fixed = [];
  for (const { row, value: v } of anchors) {
    const r = checkAnchor(row, v, c, opts);
    if (r.ok) { pass(true, `seq ${r.seq} was fixed in time by ${r.tsa} at ${r.gen_time} (RFC 3161 token; ${r.chain.join(" ← ")}; trusted as ${r.trust})`); fixed.push(r); if (!last || r.seq > last.project_seq) last = { project_seq: r.seq, gen_time: r.gen_time, tsa: r.tsa }; }
    else pass(false, `the timestamp in ledger #${row.audit_id}: ${r.problems.join("; ")}`);
  }
  // What each timestamp proves: the rows it covers first existed by its time — not that they were written then.
  fixed.sort((a, b) => a.seq - b.seq);
  let from = 1, late = 0;
  for (const f of fixed) {
    if (f.seq < from) continue;
    const span = chain.rows.filter((r) => Number(r.project_seq) >= from && Number(r.project_seq) <= f.seq);
    const oldest = span.reduce((m, r) => Math.min(m, Date.parse(r.at_utc)), Infinity);
    for (const r of span) if (Date.parse(r.at_utc) > Date.parse(f.gen_time) + 5 * 60e3) pass(false, `seq ${r.project_seq} says it was written at ${r.at_utc}, after the timestamp that covers it (${f.gen_time})`);
    if (Date.parse(f.gen_time) - oldest > 26 * 3600e3) { late++; note(`seq ${from} to ${f.seq} were first fixed in time at ${f.gen_time}, more than a day after the oldest of them was written (${new Date(oldest).toISOString()}): the timestamp proves they existed by then, not when they were written`); }
    from = f.seq + 1;
  }
  if (from > 1) note(`${late ? "the other rows" : "every row"} up to seq ${from - 1} ${late ? "were" : "was"} fixed in time within a day of being written`);
  if (!anchors.length) note("the chain holds no external timestamp yet: it is checked, but not fixed in time by a third party");
  else if (last && c.head && last.project_seq + 1 < c.head.project_seq) {
    const from = last.project_seq + 2, to = c.head.project_seq;
    note(`${from === to ? `seq ${to} is` : `seq ${from} to ${to} are`} newer than the last external timestamp (chained, not yet fixed in time)`);
  }
  if (anchors.length) note("certificate revocation is not checked offline");
  note("the strongest check: keep each pack you are sent and pass its head with --expect <seq>:<hash> next time — a rewritten history cannot extend it");
  return { ok, lines, last_timestamp: last };
}

// ── Run as a program ───────────────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const valued = (i) => args[i - 1] === "--root" || args[i - 1] === "--expect";
  const file = args.find((a, i) => !a.startsWith("--") && !valued(i));
  if (!file) { console.log("usage: node ledger-verify.mjs <audit-pack.json> [--root extra-root.pem] [--expect <seq>:<hash>] [--trust-system-roots]"); process.exit(2); }
  const extraRoots = args.flatMap((a, i) => args[i - 1] === "--root" ? pemCerts(readFileSync(a, "utf8")) : []);
  const expect = args.flatMap((a, i) => args[i - 1] === "--expect" ? [{ seq: a.split(":")[0], hash: a.split(":")[1] ?? "" }] : []);
  const pack = parse(readFileSync(file, "utf8"));
  if (!pack) { console.log(`FAIL  ${file} is not JSON`); process.exit(1); }
  const r = verifyPack(pack, { extraRoots, expect, trustSystemRoots: args.includes("--trust-system-roots") });
  console.log(`Sentinel audit pack — ${pack.project?.key ?? "?"} — made ${pack.generated_at ?? "?"}\n` + r.lines.join("\n"));
  console.log(r.ok ? "\nRESULT: everything checked passed." : "\nRESULT: something did not pass — see FAIL above.");
  process.exit(r.ok ? 0 : 1);
}
