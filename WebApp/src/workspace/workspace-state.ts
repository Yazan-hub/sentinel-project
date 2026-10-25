// The workspace controller: one open document, guarded against a project or person switch, with serialised
// compare-and-swap writes. No DOM here; the page renders what `render` is handed.
import type { CommentRow, DocRow, Executability, VersionListRow, VersionRow } from "../sentinel-core/doc-blocks";
import { statusLine } from "../sentinel-core/doc-blocks";
import { canEditRole, canGovernRole } from "../setups/my-role";
import { pathSegment } from "../setups/escape-html";

export interface WorkspaceDeps {
  json(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: object): Promise<{ status: number; body: any }>; // path after the bridge base
  activePid(): string; scope(): string; // loadScope(activePid()): project key + signed-in user id (src/setups/load-scope.ts)
  onProjectChange(cb: () => void): () => void; askYesNo(q: string): Promise<boolean>;
  role(key: string): Promise<string>; me(): Promise<string>;
}
export interface WorkspaceState { key: string; doc: DocRow | null; versions: VersionListRow[]; comments: CommentRow[]; ex: Executability | null;
  role: string; me: string; problems: string[]; message: string; viewing: VersionRow | null;
  respondsTo: { title: string; version_no: number | null } | null /* the EIR this document answers, loaded by open */ }
export interface Workspace {
  open(docId: string): Promise<void>; reload(): Promise<void>; viewVersion(n: number | null): Promise<void>;
  write(method: "POST" | "PUT" | "PATCH", rest: string, body?: object): Promise<DocRow | null>; // rest after /bimdocs/:key/:docId
  get<T>(path: string): Promise<T | null>; // guarded GET of any bridge path; null when stale or refused (message set)
  post<T>(path: string, body?: object): Promise<T | null>; // guarded POST of any other bridge path; adds actor, never updated_at; any non-2xx (a 409 too) sets message and returns null without asking
  rescore(): Promise<void>; // guarded re-read of …/executability into state.ex; no render
  state(): WorkspaceState;
}

export const CONFLICT_QUESTION = "Someone changed this document since you opened it. Save yours anyway? If they changed this same part, their change is replaced.";
export const STATUS_CHANGED = "This document was published or archived meanwhile, so it cannot be edited here. Nothing was saved.";
export const REFRESHED = "Saved. Other parts were refreshed with their latest text.";
const NOT_SAVED_RELOADED = "Nothing was saved. The document was reloaded.";
const NO_ANSWER = "The bridge did not answer. Nothing was saved.";

/** The bridge's two compare-and-swap 409s (a status 409 is not one of them). */
export const isStaleConflict = (message: unknown): boolean =>
  typeof message === "string" && /^stale write|changed or was issued meanwhile/.test(message);

export const emptyState = (key: string): WorkspaceState => ({
  key, doc: null, versions: [], comments: [], ex: null, role: "viewer", me: "", problems: [], message: "", viewing: null, respondsTo: null,
});

type Reply = { status: number; body: any };
const is2xx = (r: Reply) => r.status >= 200 && r.status < 300;
const words = (r: Reply, tail: string) => String(r.body?.message || "") || `The bridge refused this (HTTP ${r.status}).${tail}`;

export function createWorkspace(deps: WorkspaceDeps, render: (s: WorkspaceState) => void): Workspace {
  let state = emptyState(deps.activePid());
  let tok = 0; // project / scope: bumped only by a switch; a write checks this alone
  let readTok = 0; // the latest document read (open, reload)
  let viewTok = 0; // the latest version view
  let scopeAt = deps.scope();
  let queue: Promise<unknown> = Promise.resolve();
  const call = (m: "GET" | "POST" | "PUT" | "PATCH", p: string, b?: object): Promise<Reply | null> =>
    (b === undefined ? deps.json(m, p) : deps.json(m, p, b)).catch(() => null);
  const say = (message: string) => { state = { ...state, message }; };

  deps.onProjectChange(() => {
    if (deps.scope() === scopeAt) return; // a plain refresh: open editors keep their text, CAS catches any change
    const was = state;
    ++tok; ++readTok; ++viewTok;
    scopeAt = deps.scope();
    state = emptyState(deps.activePid());
    render(state);
    if (was.key === state.key && was.doc) void open(was.doc.id); // another person on the same project: re-read the role
  });

  /** Reads the document and everything shown beside it; false when stale or not read. */
  async function load(docId: string, keep: { viewing?: VersionRow | null; message: string }): Promise<boolean> { // viewing omitted (reload): the version view as it is when the answers arrive
    const mine = ++readTok, sc = tok;
    const stale = () => mine !== readTok || sc !== tok;
    const key = deps.activePid();
    const base = `/bimdocs/${pathSegment(key)}/${pathSegment(docId)}`;
    const r = await call("GET", base);
    if (stale()) return false;
    if (!r || !is2xx(r) || !r.body?.id || !Array.isArray(r.body.sections)) {
      const why = r?.body?.message || "the bridge did not answer";
      // A re-read of the document held keeps it (and the open editors on it) when the failure says nothing about access: no answer,
      // a 5xx, or a 401 (sign in again, then save). A 403, 404 or 410 means the access or the document is gone: the page empties.
      const passing = !r || r.status >= 500 || r.status === 401;
      state = passing && state.doc?.id === docId && state.key === key
        ? { ...state, message: `The document could not be re-read: ${why}. What you see may not be the latest.` }
        : { ...emptyState(key), message: `The document could not be read: ${why}.` };
      render(state);
      return false;
    }
    const doc = r.body as DocRow;
    const list = async <T>(p: string): Promise<T[]> => { const x = await call("GET", p); return x && is2xx(x) && Array.isArray(x.body) ? x.body : []; };
    const eir = async () => {
      if (!doc.responds_to) return null;
      const x = await call("GET", `/bimdocs/${pathSegment(key)}/${pathSegment(doc.responds_to)}`);
      return { title: (x && is2xx(x) && typeof x.body?.title === "string" && x.body.title) || "the linked EIR", version_no: doc.responds_to_version };
    };
    const [versions, comments, ex, respondsTo, role, me] = await Promise.all([
      list<VersionListRow>(`${base}/versions`),
      list<CommentRow>(`${base}/comments`),
      call("GET", `${base}/executability`).then((x) => (x && is2xx(x) && x.body && typeof x.body === "object" ? (x.body as Executability) : null)),
      eir(),
      deps.role(key).catch(() => "viewer"),
      deps.me().catch(() => ""),
    ]);
    if (stale()) return false;
    // A write may have landed while this read ran: its newer row of the same document is kept over this older answer.
    const held = state.doc, newer = !!held && held.id === doc.id && state.key === key && typeof held.updated_at === "string" && typeof doc.updated_at === "string" && doc.updated_at < held.updated_at;
    const row = newer && held ? held : doc;
    state = { key, doc: row, versions, comments, ex, role, me, problems: docProblems(row), message: keep.message, viewing: keep.viewing === undefined ? state.viewing : keep.viewing, respondsTo };
    render(state);
    return true;
  }

  async function open(docId: string): Promise<void> {
    scopeAt = deps.scope();
    ++viewTok; // a version view of the previous document is dropped
    await load(docId, { viewing: null, message: "" });
  }

  const reload = async (): Promise<boolean> => (state.doc ? load(state.doc.id, { message: "" }) : false);

  async function viewVersion(n: number | null): Promise<void> {
    const mine = ++viewTok, sc = tok;
    if (n === null || !state.doc) { state = { ...state, viewing: null }; render(state); return; }
    const r = await call("GET", `/bimdocs/${pathSegment(state.key)}/${pathSegment(state.doc.id)}/versions/${n}`);
    if (mine !== viewTok || sc !== tok) return;
    if (r && is2xx(r) && r.body?.snapshot) state = { ...state, viewing: r.body as VersionRow, message: "" };
    else say(r ? words(r, "") : "The bridge did not answer.");
    render(state);
  }

  async function get<T>(path: string): Promise<T | null> {
    const mine = tok;
    if (state.key !== deps.activePid()) return null;
    const r = await call("GET", path);
    if (mine !== tok) return null;
    if (!r) { say("The bridge did not answer."); return null; }
    if (!is2xx(r)) { say(words(r, "")); return null; }
    return r.body as T;
  }

  async function post<T>(path: string, body: object = {}): Promise<T | null> {
    const mine = tok;
    if (state.key !== deps.activePid()) return null;
    const actor = await deps.me().catch(() => state.me);
    if (mine !== tok) return null;
    const r = await call("POST", path, { ...body, actor });
    if (mine !== tok) return null;
    if (!r) { say("The bridge did not answer."); return null; }
    if (!is2xx(r)) { say(words(r, "")); return null; }
    return r.body as T;
  }

  async function rescore(): Promise<void> {
    const doc = state.doc;
    if (!doc) return;
    const ex = await get<Executability>(`/bimdocs/${pathSegment(state.key)}/${pathSegment(doc.id)}/executability`);
    if (ex && typeof ex === "object" && state.doc?.id === doc.id) state = { ...state, ex };
  }

  async function writeNow(method: "POST" | "PUT" | "PATCH", rest: string, body: object, docId: string | undefined): Promise<DocRow | null> {
    const mine = tok;
    const doc = state.doc;
    if (!doc || doc.id !== docId || state.key !== deps.activePid()) return null; // another document opened while this write waited: not sent
    const path = `/bimdocs/${pathSegment(state.key)}/${pathSegment(doc.id)}${rest}`;
    let r = await call(method, path, { ...body, updated_at: doc.updated_at, actor: state.me }), forced = false;
    if (mine !== tok) return null;
    if (r?.status === 409) {
      if (!isStaleConflict(r.body?.message)) {
        if (await reload()) { say(STATUS_CHANGED); render(state); }
        return null;
      }
      const yes = await deps.askYesNo(CONFLICT_QUESTION);
      if (mine !== tok) return null;
      if (!yes) {
        if (await reload()) { say(NOT_SAVED_RELOADED); render(state); }
        return null;
      }
      r = await call(method, path, { ...body, actor: state.me }); // asked once: a second 409 keeps the bridge's words below
      if (mine !== tok) return null;
      forced = true;
    }
    if (!r) { say(NO_ANSWER); return null; }
    if (!is2xx(r)) { say(words(r, " Nothing was saved.")); return null; }
    const row = r.body as DocRow | null;
    const cur = state.doc;
    if (cur && row?.id === cur.id && Array.isArray(row.sections) && typeof row.updated_at === "string" && !(row.updated_at < cur.updated_at)) state = { ...state, doc: row };
    say(forced ? REFRESHED : ""); // a write that lands clears the words an earlier refusal left (the page redraws what the resend brought)
    return row; // no render: the caller replaces its own node
  }

  function write(method: "POST" | "PUT" | "PATCH", rest: string, body: object = {}): Promise<DocRow | null> {
    const docId = state.doc?.id; // the document this write was made for; updated_at and the project are read when its turn comes
    const run = () => writeNow(method, rest, body, docId);
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  }

  return { open, reload: async () => { await reload(); }, viewVersion, write, get, post, rescore, state: () => state };
}

export function docProblems(doc: DocRow): string[] {
  const seen = new Set<string>(), twice = new Set<string>();
  for (const s of doc.sections ?? []) { if (s) (seen.has(s.id) ? twice : seen).add(s.id); }
  return [...twice].map((id) => `Two sections share the id ${id}. This document can be read here, not edited, until it is repaired.`);
}

export const reopenTarget = (last: Map<string, string>, key: string, current: DocRow | null, pending: boolean): string | null =>
  pending || current ? null : last.get(key) ?? null;

/** The page reopens its remembered document only when it goes from hidden to shown, not on every resize. */
export const becameVisible = (prev: boolean, now: boolean): boolean => !prev && now;

/** The newest BEP that is not archived (listDocs is newest first). */
export const pickBep = (list: { id: string; doc_type: string; status: string }[]): string | null =>
  list.find((d) => d.doc_type === "BEP" && d.status !== "archived")?.id ?? null;

export function resolveSection(doc: DocRow, at: string | undefined): string | null {
  if (!at) return null;
  return (doc.sections.find((s) => s?.id === at) ?? doc.sections.find((s) => s?.template_key === at))?.id ?? null;
}

export function rightsOf(st: WorkspaceState): { canEdit: boolean; canGovern: boolean } {
  const d = st.doc;
  const open = !!d && st.problems.length === 0 && (d.status === "wip" || d.status === "shared") && d.doc_type !== "READINESS" && d.doc_type !== "TIDP";
  return { canEdit: open && !st.viewing && canEditRole(st.role), canGovern: open && canGovernRole(st.role) };
}

export function reviewLines(doc: DocRow, versions: VersionListRow[]): string[] {
  const latest = versions.reduce<VersionListRow | null>((a, v) => (!a || v.version_no > a.version_no ? v : a), null);
  return [
    `Status: ${statusLine(doc)}.`,
    latest ? `Latest version: v${latest.version_no}, ${latest.label}, ${String(latest.published_at ?? "").slice(0, 10)}.` : "No version yet.",
    "Review rounds (send for review, who must decide, what is frozen) come in a later release. Share and publish from the Documents tab.",
  ];
}

export function moveId(order: string[], id: string, dir: -1 | 1): string[] {
  const i = order.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const out = [...order];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
