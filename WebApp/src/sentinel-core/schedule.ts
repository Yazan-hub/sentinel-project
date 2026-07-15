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
}
export interface Schedule {
  tasks: Task[];
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

/** Parse a schedule CSV. Columns: name, start, finish, categories (';'-separated). Header optional. */
export function csvToSchedule(csv: string): Schedule {
  const rows = csv.trim().split(/\r?\n/);
  if (rows.length && /name/i.test(rows[0]) && /start/i.test(rows[0])) rows.shift();
  const palette = ["#5457e6", "#12b6c9", "#22a35c", "#d69417", "#8b52ea", "#6b7280", "#e0564a"];
  const tasks: Task[] = [];
  rows.forEach((line, i) => {
    const c = splitCsv(line);
    if (c.length < 3) return;
    const cats = (c[3] ?? "")
      .split(/[;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      .map((x) => (x.startsWith("IFC") ? x : "IFC" + x));
    tasks.push({
      id: `C${i + 1}`, name: c[0] || `Task ${i + 1}`,
      start: normDate(c[1]), finish: normDate(c[2]),
      categories: cats, color: palette[i % palette.length],
    });
  });
  return { tasks };
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

/** Accept yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy, or anything Date parses → yyyy-mm-dd. */
function normDate(s: string): string {
  const t = (s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = "20" + y;
    // assume day-first if the first field > 12; else month-first
    const day = Number(a) > 12 ? a : b, mon = Number(a) > 12 ? b : a;
    return `${y}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(t);
  return isNaN(+d) ? iso(new Date()) : iso(d);
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
