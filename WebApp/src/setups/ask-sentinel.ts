// "Ask Sentinel" — the answering side (spec 2026-09-29 sdk-ask-sentinel, Phase 2). This account's external tools (the
// bridge's `node bridge/ask-sentinel.mjs`, the MCP tool `sentinel_ask_app`) send commands over the platform's external
// channel (@thatopen/services `client.channel.external()`; That Open's own MCP server uses the same room); the open, signed-in Sentinel tab answers with its own
// sessions. Four read-only commands (help, ping and the two below), nothing else: a command's `kind` is set by the sender and not checked, and anyone
// holding the token can send any command to an open tab — so no command here writes. Every answer is data in words: a
// read that failed says "not read — <why>", a ledger claim comes only from ledgerLine(), and when the platform's hint and
// the ledger row disagree the answer carries both and picks neither. A handler never throws: an error is an answer.
import { ledgerLine, citedRow, type CardState, type DeliveryCard, type GateLedgerRow } from "./platform-deliveries";

export const MAX_LIMIT = 20;
export const MAX_FAILURES = 10;

/** What the tab reads with — injected, so the answers are tested without a platform (main.ts wires the real ones). */
export interface AskDeps {
  appVersion: string;
  platformProjectId: () => string | null | undefined;
  /** The Sentinel project open in this tab; null while none is (still starting, signed out, nothing linked or picked). */
  sentinelProject: () => string | null;
  signedIn: () => Promise<boolean>;
  /** GET <bridge>/health — a Response-like; a throw is "never answered". */
  bridge: () => Promise<{ ok: boolean; status: number }>;
  readDeliveries: (name?: string) => Promise<DeliveryCard[]>;
  readGateLedger: (sentinelProject: string) => Promise<GateLedgerRow[]>;
}

export interface StatusAnswer {
  app_version: string; platform_project_id: string | null; sentinel_project: string | null;
  signed_in: boolean | string; bridge: string;
}
export interface DeliveryAnswer {
  name: string; version_tag: string;
  /** The card headline — the platform's hint, never the proof (any project writer can write the labels). */
  platform: string;
  failures: string[]; more_failures: number; run: string | null;
  /** Exactly ledgerLine(): "ledger #N", "not on this project's ledger yet" or "ledger not read — <why>". */
  ledger: string;
  ledger_result?: string; agrees?: boolean;
}
export interface DeliveriesAnswer { total: number; more: number; deliveries: DeliveryAnswer[]; note?: string; sentinel_project?: string | null }

const why = (e: unknown) => (e as Error)?.message || String(e);
// The card state as the ledger's `result` words (platform-gate-ledger.mjs RESULTS); no verdict for the rest.
const AS_RESULT: Record<CardState, string | null> = { passed: "pass", refused: "fail", not_checked: "not_checked", did_not_run: "did_not_run", running: null, not_read: null };

/** Pure: the per-IFC answer from the platform's cards and this project's ledger rows (or the ledger read's failure). */
export function answerDeliveries(cards: DeliveryCard[], rows: GateLedgerRow[] | null, readErr: string | null, opts: { name?: string; limit?: number } = {}): DeliveriesAnswer {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(opts.limit) || MAX_LIMIT)));
  const shown = cards.slice(0, limit);
  const deliveries = shown.map((c): DeliveryAnswer => {
    const lines = c.state === "refused" ? c.lines : [];
    const a: DeliveryAnswer = {
      name: c.name, version_tag: c.versionTag, platform: `the platform's hint: ${c.headline}`,
      failures: lines.slice(0, MAX_FAILURES), more_failures: Math.max(0, lines.length - MAX_FAILURES),
      run: c.run, ledger: ledgerLine(c.run, rows, readErr, c),
    };
    const row = readErr ? undefined : citedRow(c.run, rows, c);
    if (row) {
      const result = row.new_value?.result;
      a.ledger_result = result == null ? "not recorded on the row" : String(result);
      a.agrees = AS_RESULT[c.state] !== null && AS_RESULT[c.state] === result;
    }
    return a;
  });
  const out: DeliveriesAnswer = { total: cards.length, more: cards.length - shown.length, deliveries };
  if (!cards.length) out.note = opts.name ? `no IFC named "${opts.name}" on the platform project` : "no IFC on the platform project yet";
  else if (out.more) out.note = `${out.more} more not shown (limit ${limit})`;
  return out;
}

/** Presence only, never a verdict. */
export async function answerStatus(deps: AskDeps): Promise<StatusAnswer> {
  const [signed_in, bridge] = await Promise.all([
    deps.signedIn().then((s) => !!s, (e) => `not read — ${why(e)}`),
    deps.bridge().then((r) => (r.ok ? "reachable" : `not reachable — HTTP ${r.status}`), (e) => `not reachable — can't reach the bridge (${why(e)})`),
  ]);
  return { app_version: deps.appVersion, platform_project_id: deps.platformProjectId() || null, sentinel_project: deps.sentinelProject(), signed_in, bridge };
}

async function deliveries(payload: unknown, deps: AskDeps): Promise<DeliveriesAnswer | { error: string }> {
  const p = (payload && typeof payload === "object" ? payload : {}) as { name?: unknown; limit?: unknown };
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : undefined;
  let cards: DeliveryCard[];
  try { cards = await deps.readDeliveries(name); } catch (e) { return { error: `platform deliveries ${why(e)}` }; }
  let rows: GateLedgerRow[] | null = null;
  let readErr: string | null = null;
  const project = deps.sentinelProject();
  // Signed out, or no project open yet: the ledger is not read at all — never a claim about a ledger nobody read.
  const signedOut = await deps.signedIn().then((s) => (s ? null : "this tab is not signed in to Sentinel"), (e) => `the tab's sign-in was not read (${why(e)})`);
  if (signedOut) readErr = signedOut;
  else if (!project) readErr = "no Sentinel project is open in this tab yet";
  else { try { rows = await deps.readGateLedger(project); } catch (e) { readErr = why(e); } }
  return { ...answerDeliveries(cards, rows, readErr, { name, limit: Number(p.limit) }), sentinel_project: project };
}

/** The commands this tab answers, in the order `help` lists them. All read-only. `help` and `ping` are the two That
 *  Open's own MCP server (`npx @thatopen/services mcp`, tool `send-app-command`) expects of any app: it sends `help`
 *  first and follows the answer (services 0.35.1 docs/cli/mcp.md). */
export const COMMANDS = ["help", "ping", "sentinel.status", "sentinel.deliveries"] as const;

/** The manual an LLM reads before using this tab: what Sentinel is, each command, and what it will not do. */
export const HELP = {
  app: "Sentinel — the BIM referee: checks models and documents against the office's standard and ISO 19650, and records every verdict on an append-only ledger.",
  how_to_use: "Read-only. Ask sentinel.status first (who is signed in, which Sentinel project is open, whether the bridge answers), then sentinel.deliveries for the IFC files the Sentinel Delivery Gate judged on this platform project. Nothing sent here changes anything; changes go through a signed-in person in the app or in Revit.",
  commands: {
    help: { payload: "none", reply: "this manual" },
    ping: { payload: "{ echo?: string }", reply: "{ pong: true, echo? }" },
    "sentinel.status": { payload: "none", reply: "{ app_version, platform_project_id, sentinel_project, signed_in, bridge }" },
    "sentinel.deliveries": { payload: "{ name?: string, limit?: number (1 to 20) }", reply: "{ total, more, deliveries: [{ name, version_tag, platform, failures, more_failures, run, ledger, ledger_result?, agrees? }], note?, sentinel_project }" },
  },
  will_not: "write, publish, approve, delete or run code — a command that is not listed is refused in words",
};

/** One command → its answer. Never throws; a command it does not know is refused in words (on the channel the SDK
 *  answers a command with no handler itself: `No handler for "<type>".`). */
export async function ask(type: string, payload: unknown, deps: AskDeps): Promise<unknown> {
  try {
    if (type === "help") return HELP;
    if (type === "ping") {
      const echo = (payload as { echo?: unknown } | undefined)?.echo;
      return typeof echo === "string" ? { pong: true, echo: echo.slice(0, 200) } : { pong: true };
    }
    if (type === "sentinel.status") return await answerStatus(deps);
    if (type === "sentinel.deliveries") return await deliveries(payload, deps);
    return { error: `unknown command "${type}" — Sentinel answers only ${COMMANDS.map((c) => `"${c}"`).join(", ")} (read-only); send "help" for how to use them` };
  } catch (e) {
    return { error: `not answered — ${why(e)}` };
  }
}

/** The slice of PlatformClient this needs: `client.channel` (it throws outside the platform iframe — main.ts catches). */
export interface ChannelHost {
  channel: { external(): { on(type: string, handler: (payload: unknown) => unknown): () => void; join(): Promise<void> } };
}

/** Joins this account's external room (every kind: the bridge's asker and That Open's MCP server alike) and answers
 *  the commands above. Fire-and-forget join, as the app template does: the app works with or without the channel, so
 *  a failed join is a warning. */
export function setupAskSentinel(client: ChannelHost, deps: AskDeps) {
  const room = client.channel.external();
  for (const type of COMMANDS) room.on(type, (payload) => ask(type, payload, deps));
  room.join().catch((e) => console.warn("[ask-sentinel] external channel join failed:", e));
  return room;
}
