// An in-memory Postgres (PGlite) with a minimal Supabase shim, then every db/migrations/*.sql in name order (not probes/).
// For the standing isolation test (two-office-isolation.test.mjs). Nothing here touches a real database.
// Differences from live Supabase, on purpose small: roles carry no login/password; auth.users has only the columns the
// migrations read; no storage/realtime schemas (no migration references them); pgcrypto comes from PGlite's contrib build.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

// What Supabase provides before any migration runs.
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;  -- live: service_role bypasses RLS
create schema extensions;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now());
-- the same bodies Supabase ships: claims come from the request.jwt.claims setting PostgREST sets per request
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- Supabase's default privileges: every table / function / sequence created in public is open to the three API roles
-- (the migrations then revoke and add RLS, as on live).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function buildDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SHIM);
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try { await db.exec(readFileSync(join(MIGRATIONS, f), "utf8")); }
    catch (e) { throw new Error(`migration ${f} failed on PGlite: ${e.message}`); }
  }
  return db;
}

// Run `fn(tx)` as a signed-in user (sub = uuid), as anon (no claims), or as the service role (superuser; bypasses RLS), then roll back.
// ponytail: one transaction per call, always rolled back, so a test's writes never leak into the next test.
export async function as(db, who, fn) {
  const claims = who && who.sub ? JSON.stringify({ sub: who.sub, role: "authenticated", email: who.email || null }) : "";
  const role = who === "service" ? null : who && who.sub ? "authenticated" : "anon";
  let out;
  await db.exec("begin");
  try {
    if (role) await db.exec(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    out = await fn(db);
  } finally { await db.exec("rollback"); }
  return out;
}
