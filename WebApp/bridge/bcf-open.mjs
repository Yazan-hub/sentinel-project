// openCDE slices 1–2 (docs/compliance/CERTIFICATION_READINESS_2026-10.md §2–3): the BCF-API 3.0 surface a stock BCF client expects,
// served over the stores that exist. Slice 1: the reads — versions, current-user, projects, extensions, one topic, comments,
// viewpoints (+ snapshot, selection, coloring, visibility), files — and the list paging (`$top`, `$skip`, `$filter`). Slice 2: the
// writes that map onto governed actions — DELETE topic = the governed close (never an erase: the ledger keeps it), comment edit
// and delete (the author's own, or a lead's), viewpoint delete, related topics, document references — plus documents (the
// containers; their bytes stay end-to-end encrypted and say so), topic events (from each topic's history), and the auth discovery
// document with a thin OAuth2 authorization-code front: the consent page signs in with Supabase IN THE BROWSER (the bridge never
// sees a password), posts the session here for a one-time code, and the token endpoint hands that same JWT back — the bearer the
// bridge already accepts. The pure parts take plain values; answerOpen does the IO.
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";

export const BCF_VERSIONS = { versions: [{ version_id: "3.0", detailed_version: "https://github.com/buildingSMART/BCF-API" }] };

/** Sentinel's vocabulary, as the Issues panel and Revit use it (a stock client reads it from /extensions before it offers a form). */
export const EXTENSIONS = {
  topic_type: ["Issue", "Clash", "Request", "Remark"],
  topic_status: ["Open", "In Progress", "Resolved", "Closed"],
  topic_label: [],
  snippet_type: [],
  priority: ["Low", "Normal", "High", "Critical"],
  stage: [],
  project_actions: ["createTopic"],
  topic_actions: ["update", "updateRelatedTopics", "updateDocumentReferences", "createComment", "createViewpoint", "delete"],
  comment_actions: ["update", "delete"],
};

/** The auth discovery document (BCF-API 3.0 §3.1): where a client sends a person to sign in and where it swaps the code. Pure. */
export const authDocument = (base) => ({
  oauth2_auth_url: `${base}/oauth/authorize`,
  oauth2_token_url: `${base}/oauth/token`,
  http_basic_supported: false,
  supported_oauth2_flows: ["authorization_code_grant"],
});

/** The public base of this bridge as the caller reached it (through the Funnel: the forwarded proto and host). Pure. */
export const publicBase = (headers) => `${headers["x-forwarded-proto"] || "http"}://${headers["x-forwarded-host"] || headers.host || "localhost"}`;

/** A redirect a public client may name: https anywhere, or http on the client's own machine (a desktop BCF client listens there). */
export const redirectAllowed = (uri) => {
  try { const u = new URL(uri); return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)); } catch { return false; }
};

/** One-time authorization codes: 60 s, single use, bound to the client and redirect they were minted for. Pure over `now`. */
export function codeStore(now = () => Date.now()) {
  const codes = new Map();
  return {
    mint(client_id, redirect_uri, session) {
      for (const [k, v] of codes) if (v.exp < now()) codes.delete(k);
      if (codes.size >= 1000) throw Object.assign(new Error("too many sign-ins waiting — try again in a minute"), { status: 429 });
      const code = randomBytes(24).toString("base64url");
      codes.set(code, { client_id, redirect_uri, session, exp: now() + 60_000 });
      return code;
    },
    take(code, client_id, redirect_uri) {
      const v = codes.get(code);
      codes.delete(code);
      if (!v || v.exp < now()) return { error: "invalid_grant", error_description: "the code is unknown, used or older than 60 seconds — sign in again" };
      if (v.client_id !== client_id || v.redirect_uri !== redirect_uri) return { error: "invalid_grant", error_description: "the code was minted for another client or redirect — nothing was issued" };
      return { session: v.session };
    },
    size: () => codes.size,
  };
}

/** The consent page: signs in with Supabase in the browser, posts the session for a code, redirects back. Pure HTML. */
export function authorizePage({ supabaseUrl, anonKey, client_id, redirect_uri, state, scope }) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cfg = JSON.stringify({ supabaseUrl, anonKey, client_id, redirect_uri, state: state ?? "", scope: scope ?? "" }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to Sentinel</title>
<style>body{font:15px system-ui;background:#101014;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}form{background:#16161a;border:1px solid #2a2a30;border-radius:.6rem;padding:1.2rem;width:min(360px,92vw)}h1{font-size:17px;margin:0 0 .3rem}p{color:#9ca3af;font-size:13px;margin:.2rem 0 .8rem}input{width:100%;box-sizing:border-box;margin:.25rem 0 .6rem;padding:.5rem;border-radius:.3rem;border:1px solid #333;background:#111;color:#eee}button{width:100%;padding:.55rem;border:0;border-radius:.3rem;background:#6528d7;color:#fff;font-weight:600}#m{color:#ef4444;font-size:13px;min-height:1.2em}</style></head>
<body><form id="f"><h1>Sign in to Sentinel</h1><p>${esc(client_id)} asks to open your BCF issues. Your password goes to the sign-in service only — this page never sends it to the bridge.</p>
<label>Email<input id="e" type="email" autocomplete="username" required></label><label>Password<input id="p" type="password" autocomplete="current-password" required></label>
<button>Sign in and continue</button><div id="m"></div></form>
<script>
const C=${cfg};const m=document.getElementById("m");
document.getElementById("f").addEventListener("submit",async(ev)=>{ev.preventDefault();m.textContent="";
try{const r=await fetch(C.supabaseUrl+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json",apikey:C.anonKey},body:JSON.stringify({email:document.getElementById("e").value,password:document.getElementById("p").value})});
const s=await r.json();if(!r.ok||!s.access_token){m.textContent=s.error_description||s.msg||"sign-in refused";return}
const c=await fetch("/oauth/code",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.access_token},body:JSON.stringify({client_id:C.client_id,redirect_uri:C.redirect_uri,refresh_token:s.refresh_token,expires_in:s.expires_in})});
const j=await c.json();if(!c.ok||!j.code){m.textContent=j.message||"the bridge issued no code";return}
const u=new URL(C.redirect_uri);u.searchParams.set("code",j.code);if(C.state)u.searchParams.set("state",C.state);location.assign(u.toString());}
catch(e){m.textContent="sign-in failed: "+e.message}});
</script></body></html>`;
}

/** The public routes a client reaches before it has a bearer (BCF-API 3.0 §3): the versions, the auth document, the consent
 *  page and the token endpoint. The bridge's auth gate lets exactly these through. Pure. */
export const isPublicOpenRoute = (method, pathname) =>
  (method === "GET" && (pathname === "/bcf/versions" || pathname === "/bcf/3.0/auth" || pathname === "/oauth/authorize"))
  || (method === "POST" && pathname === "/oauth/token");

/** The open routes this module serves. null = not an open route — the topic block serves it (or 404s). Method-aware: a topic's
 *  PUT, a comment's or viewpoint's POST stay the block's; everything else under these paths is served here. */
export function parseOpen(pathname, method = "GET") {
  if (pathname === "/bcf/versions") return { kind: "versions" };
  if (pathname === "/bcf/3.0/auth") return { kind: "auth" };
  if (pathname === "/oauth/authorize") return { kind: "authorize" };
  if (pathname === "/oauth/code") return { kind: "code" };
  if (pathname === "/oauth/token") return { kind: "token" };
  if (pathname === "/bcf/3.0/current-user") return { kind: "current-user" };
  if (pathname === "/bcf/3.0/projects") return { kind: "projects" };
  let m = /^\/bcf\/3\.0\/projects\/([^/]+)$/.exec(pathname);
  if (m) return { kind: "project", pid: m[1] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/(extensions|files|documents)$/.exec(pathname);
  if (m) return { kind: m[2], pid: m[1] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/documents\/([^/]+)$/.exec(pathname);
  if (m) return { kind: "document", pid: m[1], sub: m[2] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/events$/.exec(pathname);
  if (m) return { kind: "events", pid: m[1] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)$/.exec(pathname);
  if (m) return method === "PUT" ? null : { kind: "topic", pid: m[1], guid: m[2] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/(comments|viewpoints)$/.exec(pathname);
  if (m) return method === "POST" ? null : { kind: m[3], pid: m[1], guid: m[2] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/(events|related_topics|document_references)$/.exec(pathname);
  if (m) return { kind: `topic_${m[3]}`, pid: m[1], guid: m[2] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/comments\/([^/]+)$/.exec(pathname);
  if (m) return { kind: "comment", pid: m[1], guid: m[2], sub: m[3] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/viewpoints\/([^/]+)(?:\/(snapshot|selection|coloring|visibility))?$/.exec(pathname);
  if (m) return { kind: m[4] ?? "viewpoint", pid: m[1], guid: m[2], sub: m[3] };
  return null;
}

/** A topic's history as BCF topic events (one event per history line, the line's words as the value). Pure. */
export const topicEvents = (topic) => (topic.history ?? []).map((h) => ({ topic_guid: topic.guid, date: h.date, author: h.author, events: [{ type: "history", value: h.action }] }));

/** The methods each open kind takes; anything else is a 405 in words. */
const METHODS = {
  versions: ["GET"], auth: ["GET"], authorize: ["GET"], code: ["POST"], token: ["POST"], "current-user": ["GET"], projects: ["GET"], project: ["GET"],
  extensions: ["GET"], files: ["GET"], documents: ["GET"], document: ["GET"], events: ["GET"], topic: ["GET", "DELETE"], comments: ["GET"], viewpoints: ["GET"],
  topic_events: ["GET"], topic_related_topics: ["GET", "PUT"], topic_document_references: ["GET", "POST"], comment: ["GET", "PUT", "DELETE"],
  viewpoint: ["GET", "DELETE"], snapshot: ["GET"], selection: ["GET"], coloring: ["GET"], visibility: ["GET"],
};
export const methodAllowed = (kind, method) => (METHODS[kind] ?? []).includes(method);

/** BCF's list paging: `$filter` (`field eq 'value'` joined by `and`, on the item's own fields), then `$skip`, then `$top`.
 *  A `$filter` that is not of that shape is a 400 in words — never silently the whole list. Pure. */
export function page(items, params) {
  const get = (k) => (params?.get ? params.get(k) : params?.[k]) ?? null;
  let out = items;
  const filter = get("$filter");
  if (filter) {
    const terms = String(filter).split(/\s+and\s+/i).map((t) => /^\s*([A-Za-z_]+)\s+eq\s+'((?:[^']|'')*)'\s*$/.exec(t));
    if (terms.some((t) => !t)) throw Object.assign(new Error("$filter: only `field eq 'value'` terms joined by `and` are understood — nothing was listed"), { status: 400 });
    for (const [, field, value] of terms) { const v = value.replace(/''/g, "'"); out = out.filter((it) => String(it?.[field] ?? "") === v); }
  }
  const num = (k, dflt) => { const raw = get(k); if (raw == null || raw === "") return dflt; const n = Number(raw); if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error(`${k} must be a whole number of 0 or more — nothing was listed`), { status: 400 }); return n; };
  const skip = num("$skip", 0), top = num("$top", null);
  out = out.slice(skip, top == null ? undefined : skip + top);
  return out;
}

/** A stored viewpoint snapshot as bytes: a data URL (`data:image/png;base64,…`), or bare base64 (PNG assumed); null when none. */
export function snapshotBytes(snapshot) {
  if (typeof snapshot !== "string" || !snapshot) return null;
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/s.exec(snapshot);
  const mime = m ? m[1] : "image/png", b64 = m ? m[2] : snapshot;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  const bytes = Buffer.from(b64.replace(/\s+/g, ""), "base64");
  return bytes.length ? { mime, bytes } : null;
}

/** BCF files: each live container's version in force (the live one, else the newest not deleted), named as ISO 19650 names it. */
export function fileEntries(containers, pid) {
  const out = [];
  for (const c of containers ?? []) {
    const vs = (c.container_versions ?? []).filter((v) => !v.deleted_at);
    const v = vs.find((x) => x.is_live) ?? vs.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
    if (!v) continue;
    out.push({ ifc_project: null, ifc_spatial_structure_element: null, file_name: c.iso_name ?? c.title ?? String(c.id), date: v.created_at ?? null,
      reference: `/cde/${encodeURIComponent(pid)}/containers/${encodeURIComponent(c.id)}/versions/${encodeURIComponent(v.id)}` });
  }
  return out;
}

/** The extensions with the project's members as its users. */
export const extensionsFor = (members) => ({ ...EXTENSIONS, users: (members ?? []).map((m) => m.email ?? m.user_id).filter(Boolean) });

const CODES = codeStore();

/** Serves one parsed open route. ctx: { req, url, res, send, db, corsHeaders, currentActor, currentUserToken, cde, members, readBody,
 *  requireMinRole, resolveActor, persist, broadcast, governedEditNeedsLead, isClosed, newGuid, env }. */
export async function answerOpen(route, ctx) {
  const { req, url, res, send, db, cde, members } = ctx;
  const method = req.method;
  if (!methodAllowed(route.kind, method)) return send(res, 405, { message: `${method} is not served on this openCDE route — nothing changed` });
  const useCde = cde.cdeConfigured();
  const getTopic = async (pid, guid) => (useCde ? await cde.bcfGetTopic(pid, guid) : db.topics.find((t) => t.project_id === pid && t.guid === guid)) ?? null;
  const saveTopic = async (topic) => { if (useCde) await cde.bcfSaveTopic(topic); else ctx.persist(); };
  const notFound = (what) => send(res, 404, { message: `${what} not found` });
  const now = () => new Date().toISOString();
  switch (route.kind) {
    case "versions": return send(res, 200, BCF_VERSIONS);
    case "auth": return send(res, 200, authDocument(publicBase(req.headers)));
    case "authorize": {
      const q = url.searchParams;
      const client_id = q.get("client_id") || "", redirect_uri = q.get("redirect_uri") || "";
      if (q.get("response_type") !== "code" || !client_id) return send(res, 400, { message: "the authorization request needs response_type=code and a client_id" });
      if (!redirectAllowed(redirect_uri)) return send(res, 400, { message: "redirect_uri must be https, or http on the client's own machine (localhost) — nothing was shown" });
      if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_ANON_KEY) return send(res, 503, { message: "this bridge does not forward sign-ins (SUPABASE_ANON_KEY) — no sign-in page can be shown" });
      const sb = ctx.env.SUPABASE_URL.replace(/\/$/, "");
      const html = authorizePage({ supabaseUrl: sb, anonKey: ctx.env.SUPABASE_ANON_KEY, client_id, redirect_uri, state: q.get("state"), scope: q.get("scope") });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ${sb}; form-action 'self'; base-uri 'none'` });
      return res.end(html);
    }
    case "code": {
      // The consent page, signed in: its bearer is the person's JWT (the gate verified it); the code carries that session.
      const jwt = ctx.currentUserToken();
      if (!jwt) return send(res, 401, { message: "a code is minted for a signed-in person only — the page's bearer was not a verified session" });
      const b = await ctx.readBody(req);
      if (!b?.client_id || !redirectAllowed(b?.redirect_uri)) return send(res, 400, { message: "client_id and an allowed redirect_uri are needed — no code was minted" });
      const code = CODES.mint(String(b.client_id), String(b.redirect_uri), { access_token: jwt, refresh_token: typeof b.refresh_token === "string" ? b.refresh_token : null, expires_in: Number.isFinite(b.expires_in) ? b.expires_in : 3600 });
      return send(res, 201, { code, expires_in: 60 });
    }
    case "token": {
      const b = await ctx.readBody(req);
      const grant = b?.grant_type;
      if (grant === "authorization_code") {
        const r = CODES.take(String(b.code ?? ""), String(b.client_id ?? ""), String(b.redirect_uri ?? ""));
        if (r.error) return send(res, 400, r);
        return send(res, 200, { access_token: r.session.access_token, token_type: "Bearer", expires_in: r.session.expires_in, refresh_token: r.session.refresh_token ?? undefined });
      }
      if (grant === "refresh_token") {
        if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_ANON_KEY) return send(res, 503, { message: "this bridge does not forward sign-ins (SUPABASE_ANON_KEY) — no token can be refreshed" });
        if (typeof b.refresh_token !== "string" || !b.refresh_token) return send(res, 400, { error: "invalid_request", error_description: "refresh_token is needed" });
        const r = await fetch(`${ctx.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.env.SUPABASE_ANON_KEY }, body: JSON.stringify({ refresh_token: b.refresh_token }) });
        const s = await r.json().catch(() => ({}));
        if (!r.ok || !s.access_token) return send(res, 400, { error: "invalid_grant", error_description: s.error_description || s.msg || "the refresh was refused — sign in again" });
        return send(res, 200, { access_token: s.access_token, token_type: "Bearer", expires_in: s.expires_in ?? 3600, refresh_token: s.refresh_token });
      }
      return send(res, 400, { error: "unsupported_grant_type", error_description: "authorization_code and refresh_token are the grants served" });
    }
    case "current-user": {
      const who = ctx.currentActor();
      if (who) return send(res, 200, { id: who, name: who });
      if (ctx.currentUserToken()) return send(res, 401, { message: "the session carries no identity" });
      return send(res, 200, { id: "machine", name: "the bridge (machine credential)" });
    }
    case "projects": case "project": {
      if (!useCde) return send(res, 503, { message: "projects are listed from the CDE — not configured on this bridge" });
      const rows = (await cde.listProjects()).map((p) => ({ project_id: p.key, name: p.name ?? p.key, authorization: { project_actions: EXTENSIONS.project_actions } }));
      if (route.kind === "projects") return send(res, 200, rows);
      const one = rows.find((p) => p.project_id === route.pid);
      return one ? send(res, 200, one) : notFound("project");
    }
    case "extensions": {
      let list = [];
      try { list = await members.listMembers(route.pid); } catch (e) { if (e?.status === 403 || e?.status === 404) return send(res, e.status, { message: String(e.message || e) }); }
      return send(res, 200, extensionsFor(list));
    }
    case "files": {
      if (!useCde) return send(res, 503, { message: "files are listed from the CDE — not configured on this bridge" });
      return send(res, 200, page(fileEntries(await cde.listContainers(route.pid), route.pid), url.searchParams));
    }
    case "documents": case "document": {
      // BCF documents are the project's containers; their bytes are end-to-end encrypted (the private CDE) and open in Sentinel.
      if (!useCde) return send(res, 503, { message: "documents are listed from the CDE — not configured on this bridge" });
      const docs = (await cde.listContainers(route.pid)).map((c) => ({ guid: String(c.id), filename: c.iso_name ?? c.title ?? String(c.id) }));
      if (route.kind === "documents") return send(res, 200, page(docs, url.searchParams));
      const d = docs.find((x) => x.guid === route.sub);
      if (!d) return notFound("document");
      return send(res, 409, { message: `${d.filename} is end-to-end encrypted on this CDE — its bytes open in Sentinel (Project Files), not over BCF; nothing was sent` });
    }
    case "events": {
      if (!useCde) return send(res, 503, { message: "events are listed from the CDE — not configured on this bridge" });
      const all = await cde.bcfListTopics(route.pid, { status: "all" }, db.topics.filter((t) => t.project_id === route.pid));
      return send(res, 200, page(all.flatMap(topicEvents), url.searchParams));
    }
    default: {
      const topic = await getTopic(route.pid, route.guid);
      if (!topic) return notFound("topic");
      topic.history = topic.history || [];
      if (method !== "GET") await ctx.requireMinRole(route.pid, "contributor");   // every write below is a contributor's at least
      const actor = () => ctx.resolveActor(null, "web");
      const mine = (author) => { const me = ctx.currentActor(); return !me || me === author; }; // the machine credential edits any; a person their own
      if (route.kind === "topic") {
        if (method === "GET") return send(res, 200, topic);
        // DELETE = the governed close: a governed topic (IDS:, Federation:) closes by a lead's hand only, as the PUT does; the ledger keeps it.
        if (ctx.governedEditNeedsLead(topic, { topic_status: "Closed" })) await ctx.requireMinRole(route.pid, "lead");
        if (!ctx.isClosed(topic.topic_status)) { topic.history.push({ date: now(), author: actor(), action: `Status: ${topic.topic_status || "—"} → Closed (BCF delete)` }); topic.topic_status = "Closed"; topic.modified_date = now(); await saveTopic(topic); ctx.broadcast(route.pid, { type: "topic", action: "updated", guid: topic.guid, status: "Closed" }); }
        return send(res, 200, { message: "closed, not erased — a Sentinel topic stays on the ledger", guid: topic.guid, topic_status: topic.topic_status });
      }
      if (route.kind === "comments") return send(res, 200, page(topic.comments ?? [], url.searchParams));
      if (route.kind === "viewpoints") return send(res, 200, page(topic.viewpoints ?? [], url.searchParams));
      if (route.kind === "topic_events") return send(res, 200, page(topicEvents(topic), url.searchParams));
      if (route.kind === "topic_related_topics") {
        if (method === "GET") return send(res, 200, (topic.related_topics ?? []).map((g) => ({ related_topic_guid: g })));
        // The spec's body is a bare JSON array (readBody keeps objects only): read the small raw body; `{ related_topics: [...] }` is taken too.
        let b = null; try { b = JSON.parse((await ctx.readRaw(req, { max: ctx.SMALL_JSON })).toString("utf8")); } catch { b = null; }
        const arr = Array.isArray(b) ? b : Array.isArray(b?.related_topics) ? b.related_topics : null;
        const list = arr ? arr.map((x) => x?.related_topic_guid).filter((g) => typeof g === "string" && g && g !== topic.guid) : null;
        if (!list) return send(res, 400, { message: "a list of { related_topic_guid } is needed — nothing changed" });
        topic.related_topics = [...new Set(list)].slice(0, 100); topic.history.push({ date: now(), author: actor(), action: `Related topics: ${topic.related_topics.length}` }); topic.modified_date = now();
        await saveTopic(topic); return send(res, 200, topic.related_topics.map((g) => ({ related_topic_guid: g })));
      }
      if (route.kind === "topic_document_references") {
        if (method === "GET") return send(res, 200, topic.document_references ?? []);
        const b = await ctx.readBody(req);
        const has = (k) => typeof b?.[k] === "string" && b[k].length > 0 && b[k].length <= 2000;
        if (!b || (has("url") === has("document_guid"))) return send(res, 400, { message: "a document reference names exactly one of url or document_guid — nothing was added" });
        const ref = { guid: ctx.newGuid(), ...(has("url") ? { url: b.url } : { document_guid: b.document_guid }), description: typeof b.description === "string" ? b.description.slice(0, 500) : "" };
        topic.document_references = [...(topic.document_references ?? []), ref].slice(-100); topic.history.push({ date: now(), author: actor(), action: `Document reference added: ${ref.url ?? ref.document_guid}` }); topic.modified_date = now();
        await saveTopic(topic); return send(res, 201, ref);
      }
      if (route.kind === "comment") {
        const c = (topic.comments ?? []).find((x) => x.guid === route.sub);
        if (!c) return notFound("comment");
        if (method === "GET") return send(res, 200, c);
        if (!mine(c.author)) await ctx.requireMinRole(route.pid, "lead");   // another's comment is a lead's to edit or remove
        if (method === "PUT") {
          const b = await ctx.readBody(req);
          if (typeof b?.comment !== "string" || b.comment.length > 5000) return send(res, 400, { message: "comment must be text of at most 5000 characters — nothing changed" });
          c.comment = b.comment; c.modified_date = now(); c.modified_author = actor();
          topic.history.push({ date: now(), author: actor(), action: "Comment edited" }); topic.modified_date = now(); await saveTopic(topic);
          return send(res, 200, c);
        }
        topic.comments = topic.comments.filter((x) => x.guid !== c.guid);
        topic.history.push({ date: now(), author: actor(), action: "Comment removed" }); topic.modified_date = now(); await saveTopic(topic);
        ctx.broadcast(route.pid, { type: "topic", action: "comment", guid: topic.guid });
        return send(res, 200, { message: "comment removed — the topic's history keeps the fact", guid: c.guid });
      }
      const v = (topic.viewpoints ?? []).find((x) => x.guid === route.sub);
      if (!v) return notFound("viewpoint");
      if (route.kind === "viewpoint") {
        if (method === "GET") return send(res, 200, v);
        topic.viewpoints = topic.viewpoints.filter((x) => x.guid !== v.guid);
        for (const c of topic.comments ?? []) if (c.viewpoint_guid === v.guid) c.viewpoint_guid = null;
        topic.history.push({ date: now(), author: actor(), action: "Viewpoint removed" }); topic.modified_date = now(); await saveTopic(topic);
        ctx.broadcast(route.pid, { type: "topic", action: "viewpoint", guid: topic.guid });
        return send(res, 200, { message: "viewpoint removed — the topic's history keeps the fact", guid: v.guid });
      }
      if (route.kind === "selection") return send(res, 200, { selection: v.components?.selection ?? [] });
      if (route.kind === "coloring") return send(res, 200, { coloring: v.components?.coloring ?? [] });
      if (route.kind === "visibility") return send(res, 200, { visibility: v.components?.visibility ?? { default_visibility: true, exceptions: [], view_setup_hints: {} } });
      const snap = snapshotBytes(v.snapshot);
      if (!snap) return notFound("snapshot");
      res.writeHead(200, { "Content-Type": snap.mime, "Content-Length": snap.bytes.length, "Cache-Control": "private, max-age=60", ...ctx.corsHeaders(res) });
      return res.end(snap.bytes);
    }
  }
}
