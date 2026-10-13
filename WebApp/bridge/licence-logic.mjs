// MA-7-1 — the licence gate, pure: SPDX verdicts, banned names, the weights table and the model refusal (design §6.10).
// Used by tools/licence-check/check.mjs and, from 7-8, by the photo reader before any image is sent. No file is read here.

export const ALLOWED = ["MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "BSL-1.0", "MPL-2.0", "0BSD", "Zlib", "CC0-1.0", "PSF-2.0"];
// Waiting for the founder's decision (D-7-16): warns, never fails.
export const PENDING = ["ISC", "MIT-CMU", "Unlicense", "BSD"];
const ALIAS = { "MIT License": "MIT", "Apache 2.0": "Apache-2.0", "Apache Software License": "Apache-2.0", "BSD License": "BSD" };
export const BANNED_NAMES = [
  "cloudcompare", "libredwg", "openmvs", "opendronemap", "odm", "pymupdf", "fitz", "ultralytics", "bonsai", "dust3r", "mast3r",
  "diff-gaussian-rasterization", "cubicasa5k", "sonata", "scenescript", "spatiallm", "a-scan2bim",
];

// ponytail: hand-kept like survey/service.py INSIDE; a new model is a download OK plus a row here
export const WEIGHTS = {
  "qwen3.6:latest": { digest: "3899b1c0e7c5", licence: "Apache-2.0" },
  "llava:latest": { digest: "8dd30f6b0cb1", licence: "Apache-2.0" },
  "llama3.2-vision:latest": { digest: "6f2f9757ae97", licence: "Llama-3.2-Community" },
};

const RANK = { allowed: 0, pending: 1, unknown: 2, banned: 3 };

function atom(a, row) {
  if (/\bA?GPL-/i.test(a)) return { v: "banned", why: "GPL and AGPL are not shipped (design §6.10)" };
  if (/\bLGPL-/i.test(a)) return row.process === "separate" ? { v: "allowed", why: "LGPL, separate process" } : { v: "banned", why: "LGPL only as a separate process (design §6.10)" };
  if (/\bSSPL\b|(^|-)NC(-|$)|NonCommercial|(^|-)ND(-|$)|NoDerivatives|\bLlama-[\d.]+-Community\b/i.test(a)) return { v: "banned", why: `${a} is not an open licence for Sentinel's use (design §6.10)` };
  if (ALLOWED.includes(a)) return { v: "allowed", why: "" };
  if (PENDING.includes(a)) return { v: "pending", why: "waiting for the founder's decision (D-7-16)" };
  return { v: "unknown", why: `"${a}" is not on the allow-list` };
}

// Split on a top-level (outside parentheses) separator word.
function split(s, sep) {
  const out = [];
  let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (depth === 0 && s.startsWith(sep, i)) { out.push(s.slice(last, i)); i += sep.length - 1; last = i + 1; }
  }
  out.push(s.slice(last));
  return out;
}

function evalExpr(raw, row) {
  let s = raw.trim();
  while (s.startsWith("(") && s.endsWith(")") && balanced(s.slice(1, -1))) s = s.slice(1, -1).trim();
  const ors = split(s, " OR ");
  if (ors.length > 1) return ors.map((p) => evalExpr(p, row)).reduce((a, b) => (RANK[b.v] < RANK[a.v] ? b : a));
  const ands = split(s, " AND ");
  if (ands.length > 1) return ands.map((p) => evalExpr(p, row)).reduce((a, b) => (RANK[b.v] > RANK[a.v] ? b : a));
  return atom(ALIAS[s] || s, row);
}
function balanced(s) {
  let d = 0;
  for (const c of s) { if (c === "(") d++; else if (c === ")" && --d < 0) return false; }
  return d === 0;
}

/** {v: "allowed"|"pending"|"banned"|"unknown", why}. OR takes the best part, AND the worst; a banned package name is banned whatever its field. */
export function verdict(expr, row = {}) {
  // MA-7-1 review: PEP 503 spelling (- _ . alike) and the part after an npm @scope/ or a path
  const nm = String(row.name ?? "").toLowerCase().replace(/[-_.]+/g, "-").split("/").pop();
  if (nm && BANNED_NAMES.includes(nm)) return { v: "banned", why: `${row.name} is on the banned list (design §6.10)` };
  const s = String(expr ?? "").trim();
  if (!s || /^SEE LICENSE IN/i.test(s)) return { v: "unknown", why: "no licence is named; read its licence file" };
  if (s === "UNLICENSED") return { v: "banned", why: "not licensed for reuse" };
  return evalExpr(ALIAS[s] || s, row);
}

/** null, or the words that refuse a model. A bare name is `<name>:latest`; the digest (12 hex digits, optional `sha256:` prefix) is required: with none, the name alone never passes (amendment 23(ii)). */
export function modelRefusal(name, digest12) {
  const n = String(name ?? "").includes(":") ? String(name) : `${name}:latest`;
  const d = String(digest12 ?? "").replace(/^sha256:/i, "").slice(0, 12).toLowerCase();
  const row = WEIGHTS[n];
  if (!row || !/^[0-9a-f]{12}$/.test(d) || d !== row.digest)
    return `${n}${d ? ` (${d})` : ""} is not in Sentinel's weights table — a model is used only once its licence is read and listed (tools/licence-check); nothing was read`;
  const v = verdict(row.licence);
  return v.v === "allowed" ? null : `${n} is licensed ${row.licence} — not on Sentinel's allow-list (design §6.10); nothing was read`;
}

/**
 * rows {source, name, version, licence, process?, carries?}; allow {accepted, pending}; models = bare model names (chat picker, add-in defaults).
 * A weights row the table itself refuses is information ("refused"), not a failure: that refusal is its job.
 */
export function checkAll({ npm = [], python = [], nuget = [], weights = [], models = [], allow = {} } = {}) {
  const accepted = allow.accepted || {}, pend = allow.pending || {};
  const lines = [];
  const n = { banned: 0, unknown: 0, pending: 0 };
  const note = (r, v, why) => {
    if (v === "banned") { n.banned++; lines.push(`BANNED ${r.name}@${r.version} ${r.licence} (${r.source}) — ${why}`); }
    else if (v === "unknown") { n.unknown++; lines.push(`UNKNOWN ${r.name}@${r.version} "${r.licence}" (${r.source}) — read its licence and add it to tools/licence-check/allow.json, or replace it`); }
    else if (v === "pending") { n.pending++; lines.push(`pending ${r.name}@${r.version} ${r.licence} (${r.source})`); }
  };
  const judge = (r) => {
    let { v, why } = verdict(r.licence, r);
    if (Object.hasOwn(accepted, r.name) && v !== "banned") v = "allowed";
    else if (Object.hasOwn(pend, r.name) && v === "unknown") v = "pending";
    note(r, v, why);
  };
  for (const r of [...npm, ...python, ...nuget]) {
    judge(r);
    for (const c of r.carries || []) judge({ source: r.source, name: c.name, version: c.version || "", licence: c.licence });
  }
  for (const r of weights) {
    const v = verdict(r.licence, r);
    if (v.v === "banned") lines.push(`refused ${r.name} ${r.licence} (weights) — the weights table refuses it: ${v.why}`);
    else note(r, v.v, v.why);
  }
  for (const m of models) {
    const full = m.includes(":") ? m : `${m}:latest`;
    if (!WEIGHTS[full]) note({ source: "model", name: m, version: "", licence: "no weights row" }, "pending");
  }
  return { lines, ...n, code: n.banned + n.unknown > 0 ? 1 : 0 };
}
