// The no-toll data feed (spec docs/superpowers/specs/2026-10-19-work-alongside-connectors.md §2): a revision's element rows as
// CSV or JSON at a stable URL Power BI / Excel "From Web" can read, signed in with a personal feed key over Basic (founder's
// choice 2026-10-19). Autodesk meters AEC Data Model data-out since 2026-10-06; this is the same kind of data, without the toll.
//
//   GET    /feed/:key/elements.csv?rev=latest|<rev code>|<revision id>   (Basic: any user name, the feed key as the password)
//   GET    /feed/:key/elements.json?rev=…                                 (Basic)
//   GET    /feed/:key/revisions.csv                                       (Basic)
//   GET    /feed/keys · POST /feed/keys {label} · DELETE /feed/keys/:id    (a signed-in person's own keys)
//
// Who may read is the database's answer (0044 feed_rows): the key must be live and its owner a member of the project.
import { createHash, randomBytes } from "node:crypto";
import { createLimiter, createKeyedLimiter, clientAddress, callerKey } from "./public-verify.mjs";

export const ELEMENT_COLUMNS = ["revision", "revision_date", "guid", "category", "type_name", "count", "length", "area", "volume", "weight"];
export const REVISION_COLUMNS = ["id", "revision", "revision_date", "uploaded_by", "element_count"];
const NUMERIC = new Set(["count", "length", "area", "volume", "weight", "element_count"]);
const REALM = 'Basic realm="Sentinel data feed", charset="UTF-8"';

/** The data routes (outside the bearer gate: they sign in with a feed key). → { key, what } or null. Pure. */
export function parseFeed(method, pathname) {
  if (method !== "GET") return null;
  const m = /^\/feed\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(elements\.csv|elements\.json|revisions\.csv)$/.exec(pathname);
  return m ? { key: m[1], what: m[2] } : null;
}

/** The feed key from an Authorization header: Basic (the password; the user name is ignored), or null. Pure. */
export function feedKeyOf(authorization) {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(String(authorization || ""));
  if (!m) return null;
  const text = Buffer.from(m[1], "base64").toString("utf8");
  const i = text.indexOf(":");
  const key = i < 0 ? text : text.slice(i + 1);
  return key || null;
}

/** RFC 4180 CSV with a BOM (Excel opens it as UTF-8). A text cell that a spreadsheet would run as a formula (= + - @, tab,
 *  CR) starts with a ' instead; numbers are written as numbers. Pure. */
export function toCsv(rows, columns) {
  const cell = (k, v) => {
    if (v == null) return "";
    if (NUMERIC.has(k) && v !== "" && !isNaN(v)) return String(Number(v));
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [columns.join(","), ...rows.map((r) => columns.map((k) => cell(k, r[k])).join(","))].join("\r\n") + "\r\n";
}

/** A new feed key: 32 random bytes, shown once; only its SHA-256 is stored. */
export function newFeedKey() {
  const key = "sfk_" + randomBytes(32).toString("base64url");
  return { key, hash: createHash("sha256").update(key, "utf8").digest("hex") };
}

/** The shape newFeedKey makes. Anything else is refused before the database is asked. Pure. */
export const isFeedKeyShape = (k) => /^sfk_[A-Za-z0-9_-]{43}$/.test(String(k));
const perCaller = createKeyedLimiter({ max: 120, windowMs: 60000 }); // one address cannot use up everyone's window
const perKey = createKeyedLimiter({ max: 60, windowMs: 60000 });
const allFeeds = createLimiter({ max: 600, windowMs: 60000 });

/** Answer a feed data route. deps: { cde, send, isMachine }. */
export async function answerFeed(route, { req, res, url, cde, send, isMachine }) {
  const deny = (code, message) => send(res, code, { message }, code === 401 ? { "WWW-Authenticate": REALM } : undefined);
  if (isMachine) return deny(403, "the data feed is a person's: sign in with your own feed key (Data feed screen), not the machine credential");
  const key = feedKeyOf(req.headers.authorization);
  if (!key) return deny(401, "sign in with Basic: any user name, and your feed key as the password (make one on the Data feed screen)");
  if (!perCaller.take(callerKey(clientAddress(req))))
    return send(res, 429, { message: "too many feed reads in a minute from this address — try the refresh again shortly" }, { "Retry-After": "60" });
  if (!isFeedKeyShape(key)) return deny(401, "this feed key is not valid or was revoked — make a new one on the Data feed screen");
  if (!perKey.take(createHash("sha256").update(key).digest("hex")) || !allFeeds.take())
    return send(res, 429, { message: "too many feed reads in a minute — try the refresh again shortly" }, { "Retry-After": "60" });
  try {
    if (route.what === "revisions.csv") {
      const rows = await cde.feedRpc("feed_revisions", { p_key: key, p_project_key: route.key });
      return sendText(res, toCsv(rows, REVISION_COLUMNS), "text/csv; charset=utf-8", `${route.key}-revisions.csv`);
    }
    const rows = await cde.feedRpc("feed_rows", { p_key: key, p_project_key: route.key, p_rev: url.searchParams.get("rev") || "latest" });
    if (route.what === "elements.json") return sendText(res, JSON.stringify(rows), "application/json; charset=utf-8");
    return sendText(res, toCsv(rows, ELEMENT_COLUMNS), "text/csv; charset=utf-8", `${route.key}-elements.csv`);
  } catch (e) {
    if (e?.status) return deny(e.status, e.message);
    console.warn(`[feed] ${route.key}/${route.what}: ${e?.message || e}`);
    return send(res, 502, { message: "the feed could not be read from the database just now — try the refresh again shortly" });
  }
}

function sendText(res, text, type, filename) {
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", ...(filename ? { "Content-Disposition": `inline; filename="${filename}"` } : {}) });
  res.end(text);
}

/** /feed/keys[/:id] — a signed-in person's own keys. → handled (true) or not this route (false). deps: { cde, send, readBody, signedIn }. */
export async function answerFeedKeys(req, res, url, { cde, send, readBody, signedIn }) {
  const m = /^\/feed\/keys(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname);
  if (!m) return false;
  if (!signedIn) { send(res, 403, { message: "feed keys are a signed-in person's — sign in on the web app; nothing was read or made" }); return true; }
  try {
    if (req.method === "GET" && !m[1]) send(res, 200, await cde.listFeedKeys());
    else if (req.method === "POST" && !m[1]) {
      const b = (await readBody(req)) || {};
      const label = typeof b.label === "string" ? b.label.trim().slice(0, 80) : "";
      cde.takeWriteBudget("feed keys", { perUser: 10, all: 100 });
      const { key, hash } = newFeedKey();
      const row = await cde.addFeedKey(hash, label);
      send(res, 201, { ...row, key }); // the key itself: this once, never again
    } else if (req.method === "DELETE" && m[1]) send(res, 200, await cde.revokeFeedKey(m[1]));
    else send(res, 405, { message: "Method not allowed" });
  } catch (e) { send(res, e?.status || 500, { message: String(e?.message || e) }); }
  return true;
}
