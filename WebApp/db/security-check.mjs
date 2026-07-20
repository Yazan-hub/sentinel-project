#!/usr/bin/env node
// Security regression guard — proves the anon-open RLS hole (Security Audit 2026-07, F1) stays closed.
//
// The public anon key is shipped to every browser, so "can the anon role read project data?" is the single
// most important RLS invariant in this system. Migration 0016 closed a hole where anon could read 37,525
// element_snapshots across all tenants. This script re-asserts, using ONLY the public anon key (no secret),
// that anon is still locked out of every sensitive table. Run it in CI or after any migration.
//
//   node db/security-check.mjs            # uses ../../config/.env
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node db/security-check.mjs
//
// Exit 0 = anon is locked out (good). Exit 1 = anon can read project data (REGRESSION) or config missing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  let url = process.env.SUPABASE_URL;
  let anon = process.env.SUPABASE_ANON_KEY;
  if (url && anon) return { url, anon };
  // Fall back to the repo's config/.env (KEY=VALUE lines; values may be quoted).
  for (const rel of ["../../config/.env", "../config/.env"]) {
    try {
      const txt = readFileSync(resolve(HERE, rel), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const k = m[1];
        const v = m[2].replace(/^["']|["']$/g, "");
        if (k === "SUPABASE_URL" && !url) url = v;
        if (k === "SUPABASE_ANON_KEY" && !anon) anon = v;
      }
      if (url && anon) break;
    } catch { /* try next path */ }
  }
  return { url, anon };
}

// Tables that must NEVER be readable by the anon role. If a browser (anon) needs any of these, it must be
// through an AUTHENTICATED session (RLS by membership), never the bare anon key.
const GUARDED = ["element_snapshots", "model_revisions", "bcf_topics", "bridge_docs", "bridge_events", "memberships", "audit_log"];

async function anonCanRead(url, anon, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  // Permission denied / RLS-empty are both "locked out". A 200 with >=1 row is a leak.
  if (res.status === 401 || res.status === 403) return { leaked: false, detail: `HTTP ${res.status} (denied)` };
  let rows;
  try { rows = await res.json(); } catch { return { leaked: false, detail: `HTTP ${res.status} (non-JSON)` }; }
  if (Array.isArray(rows)) return { leaked: rows.length > 0, detail: `HTTP ${res.status}, ${rows.length} row(s)` };
  // PostgREST error object (e.g. {code:'42501'}) → denied.
  return { leaked: false, detail: `HTTP ${res.status} (${rows?.code || "error"})` };
}

const { url, anon } = loadEnv();
if (!url || !anon) {
  console.error("✗ security-check: SUPABASE_URL / SUPABASE_ANON_KEY not found (env or config/.env).");
  process.exit(1);
}

console.log(`Security regression guard → ${url}`);
console.log("Asserting the PUBLIC anon key cannot read project data...\n");

let leaks = 0;
for (const table of GUARDED) {
  try {
    const { leaked, detail } = await anonCanRead(url, anon, table);
    if (leaked) { leaks++; console.log(`  ✗ ${table.padEnd(20)} ANON CAN READ — ${detail}  <-- REGRESSION`); }
    else console.log(`  ✓ ${table.padEnd(20)} locked out — ${detail}`);
  } catch (e) {
    leaks++; console.log(`  ? ${table.padEnd(20)} check failed: ${e.message}`);
  }
}

console.log("");
if (leaks) { console.error(`✗ FAIL: ${leaks} table(s) exposed to the anon key. See docs/SECURITY_AUDIT_2026-07.md (F1).`); process.exit(1); }
console.log("✓ PASS: the anon key is locked out of all guarded tables.");
process.exit(0);
