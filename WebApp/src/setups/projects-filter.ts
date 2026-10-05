/**
 * The Projects window's search, filter and sort — pure, no DOM (projects-hub-panel.ts draws what this returns).
 * Groups as the hub always has: one per office (its card first, then its projects), then "No office"; archived last
 * inside each group; the chosen sort inside that. With DEFAULT_FILTER every project is shown.
 */

export interface FilterableProject {
  key: string;
  name: string;
  appointing_party: string | null;
  created_at: string;
  container_count: number;
  settings?: { archived?: boolean } | null;
  kind?: "project" | "office";
  office_key?: string | null;
  office_name?: string | null;
}

export interface ProjectFilter {
  q: string;
  kind: "all" | "project" | "office";
  /** "all", "none" (no office), or "o:" + an office's key (prefixed: an office may be keyed "all" or "none"). */
  office: string;
  status: "all" | "active" | "archived";
  sort: "newest" | "oldest" | "name" | "containers";
}

export const DEFAULT_FILTER: ProjectFilter = { q: "", kind: "all", office: "all", status: "all", sort: "newest" };

export const isDefaultFilter = (f: ProjectFilter): boolean =>
  !f.q.trim() && f.kind === "all" && f.office === "all" && f.status === "all" && f.sort === "newest";

/** The status line: "M projects." — or "Showing N of M projects." while a filter is on over a loaded list. */
export const countLine = (f: ProjectFilter, shown: number, total: number): string => {
  const of = `${total} project${total === 1 ? "" : "s"}`;
  return isDefaultFilter(f) || !total ? `${of}.` : `Showing ${shown} of ${of}.`;
};

export interface ProjectGroup<T> {
  /** "o:" + the office's key, NO_OFFICE_GROUP, or "" for the untitled group (no offices at all: never collapsible). */
  id: string;
  title: string;
  rows: T[];
}

export const NO_OFFICE_GROUP = "none";

/** Flips a group in the collapsed set (in memory only); the untitled group is never collapsed. */
export const toggleGroup = (collapsed: Set<string>, id: string): Set<string> => {
  if (id) collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
  return collapsed;
};

/** A group's cards show unless it is collapsed - a search opens it for its matches, so a search never hides its own results. */
export const groupShown = (id: string, collapsed: Set<string>, q: string): boolean => !id || !collapsed.has(id) || !!q.trim();

const archived = (p: FilterableProject) => !!p.settings?.archived;
const time = (p: FilterableProject) => Date.parse(p.created_at) || 0;

export function filterProjects<T extends FilterableProject>(
  projects: T[],
  f: ProjectFilter,
): { groups: ProjectGroup<T>[]; shown: number; total: number } {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Offices from the whole list (not the filtered one), so a project keeps its office's title when the office card is hidden.
  const offices = projects
    .filter((p) => p.kind === "office")
    .sort((a, b) => Number(archived(a)) - Number(archived(b)));
  const officeOf = (p: T) => (p.kind === "office" ? p.key : offices.some((o) => o.key === p.office_key) ? p.office_key! : null);

  const pass = (p: T) => {
    if (f.kind !== "all" && (p.kind === "office" ? "office" : "project") !== f.kind) return false;
    if (f.status === "active" && archived(p)) return false;
    if (f.status === "archived" && !archived(p)) return false;
    if (f.office === "none" && officeOf(p) !== null) return false;
    if (f.office.startsWith("o:") && officeOf(p) !== f.office.slice(2)) return false;
    if (!words.length) return true;
    const hay = [p.name, p.key, p.office_name, p.appointing_party].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const by: Record<ProjectFilter["sort"], (a: T, b: T) => number> = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
    containers: (a, b) => b.container_count - a.container_count,
  };
  const order = (rows: T[]) => rows.sort((a, b) => Number(archived(a)) - Number(archived(b)) || by[f.sort](a, b));

  const groups: ProjectGroup<T>[] = offices.map((o) => ({
    id: "o:" + o.key,
    title: `${o.name} · office`,
    // The office's own card leads its group, as it always has.
    rows: [...(pass(o) ? [o] : []), ...order(projects.filter((p) => p.kind !== "office" && officeOf(p) === o.key && pass(p)))],
  }));
  groups.push({ id: offices.length ? NO_OFFICE_GROUP : "", title: offices.length ? "No office" : "", rows: order(projects.filter((p) => officeOf(p) === null && pass(p))) });
  const shown = groups.filter((g) => g.rows.length);
  return { groups: shown, shown: shown.reduce((n, g) => n + g.rows.length, 0), total: projects.length };
}
