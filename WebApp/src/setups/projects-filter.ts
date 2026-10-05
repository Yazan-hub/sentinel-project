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
  /** "all", "none" (no office), or an office's key. */
  office: string;
  status: "all" | "active" | "archived";
  sort: "newest" | "oldest" | "name" | "containers";
}

export const DEFAULT_FILTER: ProjectFilter = { q: "", kind: "all", office: "all", status: "all", sort: "newest" };

export const isDefaultFilter = (f: ProjectFilter): boolean =>
  !f.q.trim() && f.kind === "all" && f.office === "all" && f.status === "all" && f.sort === "newest";

export interface ProjectGroup<T> {
  title: string;
  rows: T[];
}

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
    if (f.office !== "all" && f.office !== "none" && officeOf(p) !== f.office) return false;
    if (!words.length) return true;
    const hay = [p.name, p.key, p.office_name, p.appointing_party].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const by: Record<ProjectFilter["sort"], (a: T, b: T) => number> = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    containers: (a, b) => b.container_count - a.container_count,
  };
  const order = (rows: T[]) => rows.sort((a, b) => Number(archived(a)) - Number(archived(b)) || by[f.sort](a, b));

  const groups: ProjectGroup<T>[] = offices.map((o) => ({
    title: `${o.name} · office`,
    // The office's own card leads its group, as it always has.
    rows: [...(pass(o) ? [o] : []), ...order(projects.filter((p) => p.kind !== "office" && officeOf(p) === o.key && pass(p)))],
  }));
  groups.push({ title: offices.length ? "No office" : "", rows: order(projects.filter((p) => officeOf(p) === null && pass(p))) });
  const shown = groups.filter((g) => g.rows.length);
  return { groups: shown, shown: shown.reduce((n, g) => n + g.rows.length, 0), total: projects.length };
}
