// openCDE slice 1 (docs/compliance/CERTIFICATION_READINESS_2026-10.md §2–3): the BCF-API 3.0 READS a stock BCF client expects, served
// over the stores that exist — versions, current-user, projects, extensions, one topic, comments, viewpoints (+ snapshot, selection,
// coloring, visibility), files — and the list paging (`$top`, `$skip`, `$filter`). Nothing is written here: the writes (close,
// comment edits, viewpoint deletes, auth discovery) are slice 2. The pure parts take plain values; answerOpen does the reads.
import { Buffer } from "node:buffer";

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
  topic_actions: ["update", "createComment", "createViewpoint"],
  comment_actions: [],
};

/** The open routes this module serves (GET only). null = not an open route — the topic block serves it (or 404s). */
export function parseOpen(pathname, method = "GET") {
  if (pathname === "/bcf/versions") return { kind: "versions" };
  if (pathname === "/bcf/3.0/current-user") return { kind: "current-user" };
  if (pathname === "/bcf/3.0/projects") return { kind: "projects" };
  let m = /^\/bcf\/3\.0\/projects\/([^/]+)$/.exec(pathname);
  if (m) return { kind: "project", pid: m[1] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/(extensions|files)$/.exec(pathname);
  if (m) return { kind: m[2], pid: m[1] };
  // one topic (GET only — PUT stays the topic block's); its comments and viewpoints lists (GET only — POST stays the block's)
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)$/.exec(pathname);
  if (m) return method === "GET" ? { kind: "topic", pid: m[1], guid: m[2] } : null;
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/(comments|viewpoints)$/.exec(pathname);
  if (m) return method === "GET" ? { kind: m[3], pid: m[1], guid: m[2] } : null;
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/comments\/([^/]+)$/.exec(pathname);
  if (m) return { kind: "comment", pid: m[1], guid: m[2], sub: m[3] };
  m = /^\/bcf\/3\.0\/projects\/([^/]+)\/topics\/([^/]+)\/viewpoints\/([^/]+)(?:\/(snapshot|selection|coloring|visibility))?$/.exec(pathname);
  if (m) return { kind: m[4] ?? "viewpoint", pid: m[1], guid: m[2], sub: m[3] };
  return null;
}

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

/** Serves one parsed open route. ctx: { url, res, send, db, corsHeaders, currentActor, currentUserToken, cde, members }. */
export async function answerOpen(route, ctx) {
  const { url, res, send, db, cde, members } = ctx;
  const useCde = cde.cdeConfigured();
  const getTopic = async (pid, guid) => (useCde ? await cde.bcfGetTopic(pid, guid) : db.topics.find((t) => t.project_id === pid && t.guid === guid)) ?? null;
  const notFound = (what) => send(res, 404, { message: `${what} not found` });
  switch (route.kind) {
    case "versions": return send(res, 200, BCF_VERSIONS);
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
    default: {
      const topic = await getTopic(route.pid, route.guid);
      if (!topic) return notFound("topic");
      if (route.kind === "topic") return send(res, 200, topic);
      if (route.kind === "comments") return send(res, 200, page(topic.comments ?? [], url.searchParams));
      if (route.kind === "viewpoints") return send(res, 200, page(topic.viewpoints ?? [], url.searchParams));
      if (route.kind === "comment") { const c = (topic.comments ?? []).find((x) => x.guid === route.sub); return c ? send(res, 200, c) : notFound("comment"); }
      const v = (topic.viewpoints ?? []).find((x) => x.guid === route.sub);
      if (!v) return notFound("viewpoint");
      if (route.kind === "viewpoint") return send(res, 200, v);
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
