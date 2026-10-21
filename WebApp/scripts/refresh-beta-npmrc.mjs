// Fetches That Open's current read-only npm token for the private @thatopen-platform beta engine and writes it to
// WebApp/.npmrc (git-ignored, mode 0600). The token is never printed.
//
// Why: That Open hands every Founding member the same shared token from GET /api/npm-registry/credentials and
// rotates it now and then. The old one then fails with a bare 404 on the beta tarballs (2026-10-21: CI red from
// eb1b418a, local `npm whoami` 401). Their CLI only re-fetches it inside `create --beta`/`swap`, so this does that step
// alone, from the login `thatopen login` saved (WebApp/.thatopen first, then ~/.thatopen/config.json).
// The CI secret THATOPEN_NPM_TOKEN then needs the same new token (the founder sets it; see .github/workflows/ci.yml).
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// CI passes the login as THATOPEN_ACCESS_TOKEN (a repository secret): it does not expire, so every CI run fetches That Open's
// current npm token itself and their rotations need nobody (founder, 2026-10-21: "no extra tasks").
const login = (process.env.THATOPEN_ACCESS_TOKEN ? { accessToken: process.env.THATOPEN_ACCESS_TOKEN } : null)
  ?? [join(root, ".thatopen"), join(homedir(), ".thatopen", "config.json")]
    .map((p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } })
    .find((c) => c?.accessToken);
if (!login) throw new Error("No That Open login on this PC - run `npx thatopen login --token <token>` in WebApp first.");

const apiUrl = (login.apiUrl || "https://platform.thatopen.com").replace(/\/$/, "");
const res = await fetch(`${apiUrl}/api/npm-registry/credentials?${new URLSearchParams({ accessToken: login.accessToken })}`,
  { headers: { Accept: "application/json" } });
if (res.status === 401) throw new Error("That Open refused the login (expired or revoked) - sign in again with `npx thatopen login` and update the THATOPEN_ACCESS_TOKEN secret.");
if (res.status === 403) throw new Error("That Open refused: this account is not a Founding member, so it gets no beta token.");
if (!res.ok) throw new Error(`That Open credentials request failed: HTTP ${res.status}`);
const creds = await res.json();
if (!creds.npmrc) throw new Error("That Open credentials response has no .npmrc body");

writeFileSync(join(root, ".npmrc"), creds.npmrc, { mode: 0o600 });
console.log(`[beta-npmrc] wrote WebApp/.npmrc for ${creds.scope} (${creds.registry})`);
