// Pipe tables in Markdown text: shared by the workspace renderer and the Part E reader. Pure, no DOM.
export interface PipeTable { header: string[]; rows: string[][] }

// Tested against the trimmed line: a leading whitespace-then-optional-pipe-then-whitespace prefix backtracks quadratically on a long run of spaces.
const SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

/** Cells of one row: outer pipes optional, "\|" stays a pipe, cells trimmed. */
export function splitPipeRow(line: string): string[] {
  const cells: string[] = []; let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") { cur += "|"; i++; }
    else if (line[i] === "|") { cells.push(cur); cur = ""; }
    else cur += line[i];
  }
  cells.push(cur);
  const t = cells.map((c) => c.trim()), s = line.trim();
  if (s.startsWith("|")) t.shift();
  if (t.length > 0 && s.endsWith("|") && !s.endsWith("\\|")) t.pop();
  return t;
}

export function isSeparatorRow(line: string): boolean { return SEP.test(line.trim()); }

/** A pipe row: a non-blank line with a pipe in it. */
export const isPipeRow = (line: string): boolean => line.trim() !== "" && line.includes("|");

/** A pipe row followed by a separator row starts a table; it ends at the first non-pipe line. Non-text reads nothing. */
export function readPipeTables(md: string): PipeTable[] {
  if (typeof md !== "string") return [];
  const lines = md.split(/\r?\n/), out: PipeTable[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isPipeRow(lines[i]) || i + 1 >= lines.length || !isSeparatorRow(lines[i + 1])) continue;
    const header = splitPipeRow(lines[i]), rows: string[][] = [];
    i += 2;
    while (i < lines.length && isPipeRow(lines[i])) rows.push(splitPipeRow(lines[i++]));
    out.push({ header, rows }); i--;
  }
  return out;
}
