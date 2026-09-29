// sentinel-core/schedule — PURE 4D core (no OBC/DOM). The construction-sequence model plus two
// ways to get one: generate a standard trade sequence from a start date, or parse a P6/MSP CSV
// export. Tasks carry IFC category tokens; the panel resolves those to element sets from the model
// (adapter/fragments-quantities.ts) — same "pure core + host adapter" split as the rest of sentinel-core.

export interface Task {
  id: string;
  name: string;
  start: string; // ISO date yyyy-mm-dd
  finish: string;
  categories: string[]; // IFC tokens, e.g. ["IFCWALL"] — used when `elements` is absent
  color: string;
  /** Explicit element set (model_id → local_ids). When present it overrides category mapping — used
   *  by Level mode, where each task is a storey's elements rather than a trade. */
  elements?: Record<string, number[]>;
  /** The MIDP containers this task needs delivered before it starts (item 6, 4D) — the CSV's optional 5th column. */
  containers?: string[];
}
export interface Schedule {
  tasks: Task[];
  /** CSV rows not imported, each with why — never dropped, never dated today. */
  refused?: { row: number; reason: string }[];
}

/** The default construction sequence by trade — order + typical durations (weeks). */
const TRADES = [
  { name: "Structure", cats: ["IFCSLAB", "IFCBEAM", "IFCCOLUMN"], weeks: 8, color: "#6b7280" },
  { name: "Walls", cats: ["IFCWALL", "IFCWALLSTANDARDCASE"], weeks: 6, color: "#5457e6" },
  { name: "Roof", cats: ["IFCROOF"], weeks: 2, color: "#22a35c" },
  { name: "Openings", cats: ["IFCWINDOW", "IFCDOOR"], weeks: 3, color: "#d69417" },
  { name: "Stairs", cats: ["IFCSTAIR"], weeks: 2, color: "#12b6c9" },
  { name: "Finishes", cats: ["IFCCOVERING"], weeks: 5, color: "#8b52ea" },
];

/** Sequential trade sequence from a start date (each trade begins when the previous ends). */
export function defaultSequence(startISO: string): Schedule {
  let cursor = new Date(startISO + "T00:00:00");
  const tasks: Task[] = TRADES.map((t, i) => {
    const start = new Date(cursor);
    const finish = addDays(start, t.weeks * 7);
    cursor = new Date(finish);
    return { id: `T${i + 1}`, name: t.name, start: iso(start), finish: iso(finish), categories: t.cats, color: t.color };
  });
  return { tasks };
}

/** Floor-by-floor sequence: one task per storey, bottom → top, with an overlapping cascade so the
 *  tower rises. Each task carries the storey's explicit element set (from adapter/fragments-levels). */
export function levelSequence(
  startISO: string,
  levels: { name: string; elevation: number; elements: Record<string, number[]> }[],
  opts: { offsetDays?: number; durationDays?: number } = {},
): Schedule {
  const base = new Date(startISO + "T00:00:00");
  const offset = opts.offsetDays ?? 7;
  const dur = opts.durationDays ?? 14;
  const n = levels.length;
  const tasks: Task[] = levels.map((lv, i) => {
    const start = addDays(base, i * offset);
    const finish = addDays(start, dur);
    // hue ramp blue(210)→violet(280) bottom→top so floors read as a gradient
    const hue = 210 + Math.round((i / Math.max(1, n - 1)) * 70);
    return {
      id: `L${i + 1}`, name: lv.name || `Level ${i + 1}`,
      start: iso(start), finish: iso(finish), categories: [], color: `hsl(${hue} 70% 60%)`,
      elements: lv.elements,
    };
  });
  return { tasks };
}

/** Parse a schedule CSV. Columns by position: name, start, finish, categories (';'-separated), containers (';'-separated
 *  MIDP container names, optional). Header optional. A row that cannot be read — fewer than three fields, a date that is
 *  not one, or one that could be day/month or month/day (03/04) — is refused with its reason, never dropped or dated today. */
export function csvToSchedule(csv: string): Schedule {
  const rows = csv.trim().split(/\r?\n/);
  const header = rows.length > 0 && /name/i.test(rows[0]) && /start/i.test(rows[0]);
  if (header) rows.shift();
  const palette = ["#5457e6", "#12b6c9", "#22a35c", "#d69417", "#8b52ea", "#6b7280", "#e0564a"];
  const tasks: Task[] = [];
  const refused: { row: number; reason: string }[] = [];
  rows.forEach((line, i) => {
    const row = i + 1 + (header ? 1 : 0); // the file's own line number
    if (!line.trim()) return;
    const c = splitCsv(line);
    if (c.length < 3) { refused.push({ row, reason: "fewer than three fields (name, start, finish)" }); return; }
    const start = normDate(c[1]), finish = normDate(c[2]);
    if (!start.ok) { refused.push({ row, reason: `start "${c[1]}" ${start.why}` }); return; }
    if (!finish.ok) { refused.push({ row, reason: `finish "${c[2]}" ${finish.why}` }); return; }
    if (finish.date < start.date) { refused.push({ row, reason: `finishes (${finish.date}) before it starts (${start.date})` }); return; }
    const cats = (c[3] ?? "")
      .split(/[;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      .map((x) => (x.startsWith("IFC") ? x : "IFC" + x));
    const containers = (c[4] ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    tasks.push({
      id: `C${i + 1}`, name: c[0] || `Task ${i + 1}`,
      start: start.date, finish: finish.date,
      categories: cats, color: palette[i % palette.length],
      ...(containers.length ? { containers } : {}),
    });
  });
  return { tasks, ...(refused.length ? { refused } : {}) };
}

/** A MIDP status row as GET /deliverables/:key/status answers it — only what the check reads. */
export interface MidpRow { container_name: string; status: string; due_date: string | null; published_at?: string | null }
export type InfoState = "ready" | "late" | "at_risk" | "unplanned" | "no_date";
const midpKey = (n: string) => n.trim().replace(/\.(ifc|ifczip|rvt|nwc|nwd|pdf|dwg|zip)$/i, "").toLowerCase();

/** Is the information a task needs there before it starts (item 6, 4D: the programme against the MIDP)? One verdict per
 *  container: delivered (published) on or before the start — ready; delivered after it, or due after it — late; not yet
 *  delivered but due by the start — at risk until it is; no row plans it — unplanned; planned with no date — no_date.
 *  Pure; the caller says a failed MIDP read itself. */
export function taskInformation(task: Task, rows: MidpRow[]): { container: string; state: InfoState; words: string }[] {
  return (task.containers ?? []).map((container) => {
    const row = rows.find((r) => midpKey(r.container_name) === midpKey(container));
    if (!row) return { container, state: "unplanned" as const, words: "not in the MIDP — nobody is due to deliver it" };
    const published = row.published_at ? String(row.published_at).slice(0, 10) : null;
    if (published) {
      return published <= task.start
        ? { container, state: "ready" as const, words: `delivered ${published}, before the task starts` }
        : { container, state: "late" as const, words: `delivered ${published}, after the task started ${task.start}` };
    }
    if (!row.due_date) return { container, state: "no_date" as const, words: `planned with no due date (${row.status}) — not yet delivered` };
    return row.due_date > task.start
      ? { container, state: "late" as const, words: `due ${row.due_date}, after the task starts ${task.start} — it will be late` }
      : { container, state: "at_risk" as const, words: `due ${row.due_date}, not yet delivered (${row.status}) — needed by ${task.start}` };
  });
}

/** Overall span as epoch ms (for the timeline scrubber). */
export function scheduleRange(s: Schedule): { start: number; finish: number } {
  if (!s.tasks.length) { const n = Date.now(); return { start: n, finish: n }; }
  const starts = s.tasks.map((t) => +new Date(t.start));
  const finishes = s.tasks.map((t) => +new Date(t.finish));
  return { start: Math.min(...starts), finish: Math.max(...finishes) };
}

// ── helpers ──
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, days: number): Date { const r = new Date(d); r.setDate(r.getDate() + days); return r; }

/** yyyy-mm-dd; dd/mm/yyyy or mm/dd/yyyy when a field over 12 tells them apart → yyyy-mm-dd; else why not. A date that
 *  could be either (03/04) is refused, never guessed; nothing unreadable becomes today. */
function normDate(s: string): { ok: true; date: string } | { ok: false; why: string } {
  const t = (s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return { ok: true, date: t.slice(0, 10) };
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = "20" + y;
    if (Number(a) <= 12 && Number(b) <= 12 && a !== b) return { ok: false, why: "could be day/month or month/day — write it as yyyy-mm-dd" };
    const day = Number(a) > 12 ? a : b, mon = Number(a) > 12 ? b : a;
    return { ok: true, date: `${y}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}` };
  }
  return { ok: false, why: "is not a date (yyyy-mm-dd)" };
}

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
