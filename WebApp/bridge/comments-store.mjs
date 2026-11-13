// Comment threads on a document (R2c, spec 2026-10-24 §6 Comments, §10): OUTSIDE the document, so commenting on a published one never
// touches its frozen bytes. Two bridge-only stores in bridge_docs, each a bag of appended events folded at read:
//   doc_comments       audience Everyone (every member who can read the document)
//   doc_comments_team  audience Delivery team (the Lead firm and the Firms; migration 0052 keeps every other reader out)
// bag = { events: [...], comments?: [legacy flat comments], rev }. Events: comment (a thread's first comment or a reply; carries its mentions),
// resolve, assign. Written with the service key after requireDocAccess; a rev compare-and-swap keeps two simultaneous comments both.
// Deps are injected (the members-store idiom) so the sequencing is unit-tested without Supabase.
import { randomUUID } from "node:crypto";
import { DELIVERY } from "./doc-access.mjs";

export const STORES = { everyone: "doc_comments", team: "doc_comments_team" };
export { DELIVERY };
export const MAX_COMMENT_CHARS = 4000;
export const AUDIENCE_WORDS = { everyone: "Everyone", team: "Delivery team" };
const TEAM_ONLY = "Delivery-team threads are written by the Lead firm and the Firms. Write to Everyone instead.";
const MENTION = /@([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
const MAX_MENTIONS = 20;
const RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };

const err = (status, message) => Object.assign(new Error(message), { status });

const wire = async (deps = {}) => {
  const need = ["getDoc", "requireDocAccess", "myMembership", "listMembers", "docGet", "docInsert", "docCas", "audit", "sub", "actor"].some((k) => deps[k] === undefined);
  const [cde, mem, auth, access, store] = need ? await Promise.all([import("./cde-store.mjs"), import("./members-store.mjs"), import("./bridge-auth.mjs"), import("./doc-access.mjs"), import("./bimdocs-store.mjs")]) : [];
  return {
    getDoc: deps.getDoc || store.getDoc,
    requireDocAccess: deps.requireDocAccess || access.requireDocAccess,
    myMembership: deps.myMembership || mem.myMembership,
    listMembers: deps.listMembers || mem.listMembers,
    // reads go forward the caller's session (RLS, 0052, is the second wall for the team bag); writes are the bridge's (service)
    docGet: deps.docGet || cde.docGet,
    docInsert: deps.docInsert || ((s, p, id, data) => cde.docInsert(s, p, id, data, { service: true })),
    docCas: deps.docCas || ((s, p, id, data, rev) => cde.docReplaceIfField(s, p, id, data, "rev", rev, { service: true })),
    audit: deps.audit || cde.audit,
    sub: deps.sub || auth.currentSub,
    actor: deps.actor || ((claimed) => auth.resolveActor(claimed, "web")),
  };
};

/** An active member of a delivery party (the Lead firm or a Firm): the only readers of the Delivery-team bag. */
export const inDelivery = (me) => me.role !== "service" && me.state === "active" && DELIVERY.includes(me.party);

/** The folded threads of one bag, in the order they were started. Pure. A legacy comment folds as a thread root anchored on its section. */
export function foldThreads(bag, audience) {
  const byId = new Map(), order = [];
  const root = (t) => { byId.set(t.id, t); order.push(t); };
  for (const c of bag?.comments ?? [])
    root({ id: c.id, audience, anchor: { section_id: c.section_id ?? null, block_id: null }, author: c.author, author_uid: null, text: c.text, created_at: c.created_at,
      replies: [], resolved: false, resolved_by: null, assignee: null, mentions: [] });
  for (const e of bag?.events ?? []) {
    if (e.type === "comment" && e.thread_id === e.id)
      root({ id: e.id, audience, anchor: { section_id: e.anchor?.section_id ?? null, block_id: e.anchor?.block_id ?? null }, author: e.author, author_uid: e.author_uid ?? null,
        text: e.text, created_at: e.created_at, replies: [], resolved: false, resolved_by: null, assignee: null, mentions: e.mentions ?? [] });
    else if (e.type === "comment") byId.get(e.thread_id)?.replies.push({ id: e.id, author: e.author, text: e.text, created_at: e.created_at, mentions: e.mentions ?? [] });
    else if (e.type === "resolve" && byId.has(e.thread_id)) { const t = byId.get(e.thread_id); t.resolved = !!e.resolved; t.resolved_by = e.resolved ? e.by ?? null : null; }
    else if (e.type === "assign" && byId.has(e.thread_id)) byId.get(e.thread_id).assignee = e.assignee_uid ? { uid: e.assignee_uid, email: e.assignee ?? null } : null;
  }
  return order;
}

/** The compare-and-swap append: two reviewers commenting simultaneously is THE use case, and a plain read-modify-write would let the
 *  last write swallow the other's comment. The write is conditional on the rev we read (legacy bags: rev absent → is.null). → the bag as written. */
async function appendEvent(d, store, doc, event) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const bag = await d.docGet(store, doc.project_id, doc.id);
    if (!bag) {
      const first = { events: [event], rev: 1 };
      try { await d.docInsert(store, doc.project_id, doc.id, first); return first; }
      catch (e) {
        // A permission denial is not a lost race — retrying it and calling the store "busy" hid an RLS mismatch once.
        if (e?.status === 401 || e?.status === 403) throw err(403, "you are not allowed to comment on this project");
        continue; // a concurrent first insert won — re-read and CAS onto it
      }
    }
    const next = { ...bag, events: [...(bag.events || []), event], rev: (bag.rev || 0) + 1 };
    if (await d.docCas(store, doc.project_id, doc.id, next, bag.rev === undefined ? null : String(bag.rev))) return next;
  }
  throw err(409, "comment store is busy — please retry");
}

/** The caller, the document and every thread the caller may read: { doc, me, can_team, threads } — one read per bag, the team bag only for a delivery party. */
async function load(d, key, docId, level) {
  const doc = await d.getDoc(key, docId); // membership + 404 in one place
  await d.requireDocAccess(key, doc, level);
  const me = await d.myMembership(key);
  const can_team = inDelivery(me);
  const [every, team] = await Promise.all([d.docGet(STORES.everyone, doc.project_id, docId), can_team ? d.docGet(STORES.team, doc.project_id, docId) : null]);
  return { doc, me, can_team, bags: { everyone: every, team }, threads: [...foldThreads(every, "everyone"), ...foldThreads(team, "team")] };
}
const defaultAudience = (can_team) => (can_team ? "team" : "everyone");
const sectionWords = (doc, t) => doc.sections.find((s) => s.id === t.anchor.section_id)?.heading ?? null;

function checkText(text) {
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) throw err(400, "comment text is required");
  if (body.length > MAX_COMMENT_CHARS) throw err(400, `comment too long (${body.length}; limit ${MAX_COMMENT_CHARS})`);
  return body;
}

/** A person who must read the thread (a mention, an assignee): a Delivery-team thread names the Client and no-party members back as refused. */
function mustRead(p, audience) {
  if (audience === "team" && !DELIVERY.includes(p.party))
    throw err(400, `${p.email} cannot read Delivery-team threads — the Client and members with no party read Everyone threads only. Mention them in an Everyone thread, or take them out of this one.`);
}

/** @e-mail of an active member in the text → [{uid, email}] (non-members are left as plain text). Reads the member list only when the text has a mention. */
async function mentionsOf(d, key, text, audience) {
  const emails = [...new Set([...text.matchAll(MENTION)].map((m) => m[1].toLowerCase()))].slice(0, MAX_MENTIONS);
  if (!emails.length) return [];
  const members = await d.listMembers(key);
  const out = [];
  for (const e of emails) {
    const p = members.find((m) => m.state === "active" && String(m.email).toLowerCase() === e);
    if (!p) continue;
    mustRead(p, audience);
    out.push({ uid: p.user_id, email: p.email });
  }
  return out;
}

/** → { threads, can_team, default_audience } — Everyone threads, plus Delivery-team threads for a delivery party. The machine and every other member read Everyone only. */
export async function listThreads(key, docId, deps) {
  const d = await wire(deps);
  const { threads, can_team } = await load(d, key, docId, "read");
  return { threads, can_team, default_audience: defaultAudience(can_team) };
}

/** The old panel's flat list: every Everyone comment (roots and replies) as {id, section_id, author, text, created_at}. */
export async function listFlat(key, docId, deps) {
  const d = await wire(deps);
  const doc = await d.getDoc(key, docId);
  return foldThreads(await d.docGet(STORES.everyone, doc.project_id, docId), "everyone")
    .flatMap((t) => [{ id: t.id, section_id: t.anchor.section_id, author: t.author, text: t.text, created_at: t.created_at },
      ...t.replies.map((r) => ({ id: r.id, section_id: t.anchor.section_id, author: r.author, text: r.text, created_at: r.created_at }))]);
}

const ledger = (d, doc, actor, audience, action, facts, kind) => audience === "team"
  ? d.audit(doc.project_id, "doc_team_thread", doc.id, "team_thread_changed", actor || "web", null, { kind })
  : d.audit(doc.project_id, "bim_document", doc.id, action, actor || "web", null, facts);

/** A new thread on the document, a section or a block. anchor {section_id?, block_id?}; audience "everyone" | "team" (default: the caller's). → the thread. */
export async function addThread(key, docId, { anchor, text, audience } = {}, actor, deps) {
  const d = await wire(deps);
  const { doc, can_team } = await load(d, key, docId, "comment");
  const aud = audience ?? defaultAudience(can_team);
  if (aud !== "everyone" && aud !== "team") throw err(400, "audience must be everyone or team (Everyone, Delivery team)");
  if (aud === "team" && !can_team) throw err(403, TEAM_ONLY);
  const at = { section_id: anchor?.section_id ?? null, block_id: anchor?.block_id ?? null };
  const section = at.section_id == null ? null : doc.sections.find((s) => s.id === at.section_id);
  if (at.section_id != null && !section) throw err(404, `section not found — available: ${doc.sections.map((s) => s.id).join(", ")}`);
  if (at.block_id != null) {
    const { blocksOf } = await import("./doc-blocks.mjs");
    if (!section || !blocksOf(section).some((b) => b?.id === at.block_id)) throw err(404, "block not found in that section");
  }
  const body = checkText(text);
  const mentions = await mentionsOf(d, key, body, aud);
  const id = randomUUID();
  const event = { id, type: "comment", thread_id: id, anchor: at, author: d.actor(actor), author_uid: d.sub() ?? null, text: body, mentions, created_at: new Date().toISOString() };
  const bag = await appendEvent(d, STORES[aud], doc, event);
  await ledger(d, doc, actor, aud, "comment_added", { section: section?.heading ?? null, chars: body.length }, "comment");
  return foldThreads(bag, aud).find((t) => t.id === id);
}

/** A reply on a thread the caller can read (a team thread is "not found" to everyone else). → the reply. */
export async function reply(key, docId, threadId, { text } = {}, actor, deps) {
  const d = await wire(deps);
  const { doc, threads } = await load(d, key, docId, "comment");
  const t = threads.find((x) => x.id === threadId);
  if (!t) throw err(404, "thread not found");
  const body = checkText(text);
  const mentions = await mentionsOf(d, key, body, t.audience);
  const event = { id: randomUUID(), type: "comment", thread_id: threadId, author: d.actor(actor), author_uid: d.sub() ?? null, text: body, mentions, created_at: new Date().toISOString() };
  await appendEvent(d, STORES[t.audience], doc, event);
  await ledger(d, doc, actor, t.audience, "comment_added", { section: sectionWords(doc, t), chars: body.length }, "comment");
  return { id: event.id, author: event.author, text: body, created_at: event.created_at, mentions };
}

/** Resolve or reopen: the thread's author, its assignee, or a lead. → the thread. */
export async function resolveThread(key, docId, threadId, { resolved = true } = {}, actor, deps) {
  const d = await wire(deps);
  const { doc, me, threads } = await load(d, key, docId, "comment");
  const t = threads.find((x) => x.id === threadId);
  if (!t) throw err(404, "thread not found");
  if (typeof resolved !== "boolean") throw err(400, "resolved must be true or false");
  const uid = d.sub() ?? null;
  const mine = uid && (t.author_uid === uid || t.assignee?.uid === uid);
  if (!mine && me.role !== "service" && (RANK[me.role] || 0) < RANK.lead)
    throw err(403, "Only the person who wrote this thread, the person it is assigned to, or a lead can resolve or reopen it.");
  if (t.resolved === resolved) return t;
  const event = { id: randomUUID(), type: "resolve", thread_id: threadId, resolved, by: d.actor(actor), by_uid: uid, created_at: new Date().toISOString() };
  const bag = await appendEvent(d, STORES[t.audience], doc, event);
  await ledger(d, doc, actor, t.audience, "comment_resolved", { section: sectionWords(doc, t), resolved, by_uid: uid }, "resolve");
  return foldThreads(bag, t.audience).find((x) => x.id === threadId);
}

/** Assign a thread to an active member (null clears it). The e-mail comes from the member list, never from the body. → the thread. */
export async function assignThread(key, docId, threadId, { assignee_uid } = {}, actor, deps) {
  const d = await wire(deps);
  const { doc, threads } = await load(d, key, docId, "comment");
  const t = threads.find((x) => x.id === threadId);
  if (!t) throw err(404, "thread not found");
  let who = null;
  if (assignee_uid != null) {
    who = (await d.listMembers(key)).find((m) => m.user_id === assignee_uid && m.state === "active");
    if (!who) throw err(400, "that person is not an active member of this project");
    mustRead(who, t.audience);
  }
  const event = { id: randomUUID(), type: "assign", thread_id: threadId, assignee_uid: who?.user_id ?? null, assignee: who?.email ?? null, by: d.actor(actor), by_uid: d.sub() ?? null, created_at: new Date().toISOString() };
  const bag = await appendEvent(d, STORES[t.audience], doc, event);
  await ledger(d, doc, actor, t.audience, "comment_assigned", { section: sectionWords(doc, t), assignee: event.assignee, assignee_uid: event.assignee_uid }, "assign");
  return foldThreads(bag, t.audience).find((x) => x.id === threadId);
}
