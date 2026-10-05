import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { filterProjects, isDefaultFilter, countLine, groupShown, toggleGroup, NO_OFFICE_GROUP, DEFAULT_FILTER, type ProjectFilter, type FilterableProject } from "./projects-filter";

const p = (key: string, o: Partial<FilterableProject> = {}): FilterableProject => ({
  key,
  name: key,
  appointing_party: null,
  created_at: "2026-01-01T00:00:00Z",
  container_count: 0,
  ...o,
});

// Fetched order (as the bridge returns it): mixed dates, an archived office, an archived project, loose projects.
const list: FilterableProject[] = [
  p("hq", { name: "HQ Office", kind: "office", created_at: "2026-01-01T00:00:00Z" }),
  p("aster-tower", { name: "Aster Tower", office_key: "hq", office_name: "HQ Office", created_at: "2026-03-01T00:00:00Z", container_count: 5 }),
  p("old-wing", { name: "Old Wing", office_key: "hq", office_name: "HQ Office", created_at: "2026-05-01T00:00:00Z", settings: { archived: true } }),
  p("bay-bridge", { name: "Bay Bridge", office_key: "hq", office_name: "HQ Office", created_at: "2026-02-01T00:00:00Z", container_count: 9, appointing_party: "Harbour Authority" }),
  p("north", { name: "North Office", kind: "office", created_at: "2026-01-02T00:00:00Z", settings: { archived: true } }),
  p("north-yard", { name: "North Yard", office_key: "north", office_name: "North Office", created_at: "2026-04-01T00:00:00Z" }),
  p("sec2-smoke", { name: "SEC-2 smoke", created_at: "2026-10-05T00:00:00Z" }),
  p("demo", { name: "Demo", created_at: "2026-06-01T00:00:00Z", container_count: 2 }),
  p("ghost", { name: "Ghost", office_key: "gone", created_at: "2026-07-01T00:00:00Z", settings: { archived: true } }),
];

const run = (f: Partial<ProjectFilter> = {}) => filterProjects(list, { ...DEFAULT_FILTER, ...f });
const keys = (f: Partial<ProjectFilter> = {}) => run(f).groups.map((g) => [g.title, g.rows.map((r) => r.key)]);
const flat = (f: Partial<ProjectFilter> = {}) => run(f).groups.flatMap((g) => g.rows.map((r) => r.key));

describe("filterProjects", () => {
  it("defaults: today's set and grouping, archived last, newest first inside each group", () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
    const r = run();
    expect(r.total).toBe(list.length);
    expect(r.shown).toBe(list.length);
    expect(keys()).toEqual([
      ["HQ Office · office", ["hq", "aster-tower", "bay-bridge", "old-wing"]],
      ["North Office · office", ["north", "north-yard"]],
      ["No office", ["sec2-smoke", "demo", "ghost"]],
    ]);
  });

  it("no offices loaded: one untitled group", () => {
    const r = filterProjects([p("a"), p("b", { created_at: "2026-02-01T00:00:00Z" })], DEFAULT_FILTER);
    expect(r.groups).toEqual([{ id: "", title: "", rows: [expect.objectContaining({ key: "b" }), expect.objectContaining({ key: "a" })] }]);
  });

  it("search: case-insensitive, trimmed, every word must match name, key, office name or appointing party", () => {
    expect(flat({ q: "  aster tower " })).toEqual(["aster-tower"]);
    expect(flat({ q: "ASTER-TOWER" })).toEqual(["aster-tower"]);
    expect(flat({ q: "sec2" })).toEqual(["sec2-smoke"]);
    expect(flat({ q: "harbour" })).toEqual(["bay-bridge"]);
    expect(flat({ q: "hq office bay" })).toEqual(["bay-bridge"]);
    expect(flat({ q: "north" })).toEqual(["north", "north-yard"]);
    expect(flat({ q: "aster bridge" })).toEqual([]);
  });

  it("type: projects only, offices only", () => {
    expect(flat({ kind: "office" })).toEqual(["hq", "north"]);
    expect(keys({ kind: "project" })).toEqual([
      ["HQ Office · office", ["aster-tower", "bay-bridge", "old-wing"]],
      ["North Office · office", ["north-yard"]],
      ["No office", ["sec2-smoke", "demo", "ghost"]],
    ]);
  });

  it("office: none, and a named office (its card plus its projects)", () => {
    expect(keys({ office: "none" })).toEqual([["No office", ["sec2-smoke", "demo", "ghost"]]]);
    expect(keys({ office: "o:north" })).toEqual([["North Office · office", ["north", "north-yard"]]]);
    expect(flat({ office: "o:hq", kind: "project" })).toEqual(["aster-tower", "bay-bridge", "old-wing"]);
  });

  it("status: active hides archived, archived shows only archived", () => {
    expect(flat({ status: "active" })).toEqual(["hq", "aster-tower", "bay-bridge", "north-yard", "sec2-smoke", "demo"]);
    expect(flat({ status: "archived" })).toEqual(["old-wing", "north", "ghost"]);
    // An archived office's active project still sits under its office title.
    expect(keys({ status: "active", office: "o:north" })).toEqual([["North Office · office", ["north-yard"]]]);
  });

  it("sort: oldest, name, most containers - inside each group, archived still last", () => {
    expect(keys({ sort: "oldest" })[0]).toEqual(["HQ Office · office", ["hq", "bay-bridge", "aster-tower", "old-wing"]]);
    expect(keys({ sort: "name" })[2]).toEqual(["No office", ["demo", "sec2-smoke", "ghost"]]);
    expect(keys({ sort: "containers" })[0]).toEqual(["HQ Office · office", ["hq", "bay-bridge", "aster-tower", "old-wing"]]);
  });

  it("office: an office keyed \"none\" or \"all\" never collides with the built-in choices", () => {
    const l = [p("none", { name: "None", kind: "office" }), p("x", { office_key: "none", office_name: "None" }), p("all", { name: "All", kind: "office" }), p("loose")];
    const ks = (office: string) => filterProjects(l, { ...DEFAULT_FILTER, office }).groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(ks("none")).toEqual(["loose"]);
    expect(ks("o:none")).toEqual(["none", "x"]);
    expect(ks("o:all")).toEqual(["all"]);
  });

  it("sort by name is numeric-aware (Tower 2 before Tower 10)", () => {
    const l = [p("t10", { name: "Tower 10" }), p("t2", { name: "Tower 2" }), p("b11", { name: "block 11" }), p("b9", { name: "Block 9" })];
    expect(filterProjects(l, { ...DEFAULT_FILTER, sort: "name" }).groups[0].rows.map((r) => r.key)).toEqual(["b9", "b11", "t2", "t10"]);
  });

  it("countLine: 'M projects.' by default or with nothing loaded, else 'Showing N of M projects.'", () => {
    expect(countLine(DEFAULT_FILTER, 9, 9)).toBe("9 projects.");
    expect(countLine(DEFAULT_FILTER, 1, 1)).toBe("1 project.");
    expect(countLine({ ...DEFAULT_FILTER, q: "aster" }, 1, 9)).toBe("Showing 1 of 9 projects.");
    expect(countLine({ ...DEFAULT_FILTER, q: "aster" }, 0, 0)).toBe("0 projects.");
  });

  it("an empty result: no groups, shown 0 of total", () => {
    const r = run({ q: "nothing-like-this" });
    expect(r.groups).toEqual([]);
    expect(r.shown).toBe(0);
    expect(r.total).toBe(list.length);
  });

  it("isDefaultFilter: any change is a filter", () => {
    expect(isDefaultFilter({ ...DEFAULT_FILTER, q: "   " })).toBe(true);
    for (const f of [{ q: "a" }, { kind: "office" }, { office: "none" }, { status: "active" }, { sort: "name" }] as Partial<ProjectFilter>[])
      expect(isDefaultFilter({ ...DEFAULT_FILTER, ...f })).toBe(false);
  });
});

describe("group show / hide", () => {
  it("ids: o:<office key> per office, a fixed id for No office, none for the untitled group", () => {
    expect(run().groups.map((g) => g.id)).toEqual(["o:hq", "o:north", NO_OFFICE_GROUP]);
    // An office keyed like the fixed id never collides with it.
    const l = [p("none", { name: "None", kind: "office" }), p("loose")];
    expect(filterProjects(l, DEFAULT_FILTER).groups.map((g) => g.id)).toEqual(["o:none", NO_OFFICE_GROUP]);
    expect(NO_OFFICE_GROUP).not.toMatch(/^o:/);
  });

  it("every group starts open; a toggle hides it, a second shows it again", () => {
    const c = new Set<string>();
    expect(groupShown("o:hq", c, "")).toBe(true);
    toggleGroup(c, "o:hq");
    expect(groupShown("o:hq", c, "")).toBe(false);
    expect(groupShown("o:north", c, "")).toBe(true);
    toggleGroup(c, "o:hq");
    expect(groupShown("o:hq", c, "")).toBe(true);
  });

  it("a collapse survives a filter change (type, office, status, sort do not open it)", () => {
    const c = toggleGroup(new Set<string>(), "o:hq");
    for (const f of [{ kind: "project" }, { status: "active" }, { office: "o:hq" }, { sort: "name" }] as Partial<ProjectFilter>[]) {
      const g = run(f).groups.find((x) => x.id === "o:hq")!;
      expect(groupShown(g.id, c, { ...DEFAULT_FILTER, ...f }.q)).toBe(false);
    }
  });

  it("a search opens a collapsed group for its matches and it closes again when the search clears", () => {
    const c = toggleGroup(new Set<string>(), "o:hq");
    expect(run({ q: "aster" }).groups.map((g) => g.id)).toEqual(["o:hq"]);
    expect(groupShown("o:hq", c, "aster")).toBe(true);
    expect(groupShown("o:hq", c, "   ")).toBe(false);
    expect(groupShown("o:hq", c, "")).toBe(false);
    expect(c.has("o:hq")).toBe(true);
  });

  it("the untitled group is never collapsible", () => {
    const c = toggleGroup(new Set<string>(), "");
    expect(c.size).toBe(0);
    expect(groupShown("", new Set([""]), "")).toBe(true);
  });
});

// The panel imports the viewer (no DOM under vitest here), so its wiring is pinned by a scan of its source.
describe("projects-hub-panel wiring", () => {
  const src = readFileSync(new URL("./projects-hub-panel.ts", import.meta.url), "utf8");
  it("draws the grid through filterProjects, with the search box, four selects and Clear", () => {
    expect(src).toMatch(/import \{[^}]*\bfilterProjects\b[^}]*\} from "\.\/projects-filter"/);
    expect(src).toContain("filterProjects(projects, f)");
    for (const id of ["ph-q", "ph-f-kind", "ph-f-office", "ph-f-status", "ph-f-sort", "ph-clear"]) expect(src).toContain(`id="${id}"`);
    expect(src).toContain('type="search"');
    expect(src).toContain("No project matches");
    expect(src).toContain('addEventListener("input"');
    expect(src).toContain('e.key !== "Escape"');
    expect(src).toContain("countLine(f, shown, total)");
  });
  it("labels the Status and Sort selects visibly, prefixes office choices, keeps focus, shows a new project", () => {
    expect(src).toContain('<option value="all">All statuses</option>');
    expect(src).toContain('<option value="newest">Sort: Newest</option>');
    expect(src).toContain('<option value="o:${esc(o.key)}">');
    // Clear rebuilds the grid (and may hide the toolbar's Clear): focus goes back to the search box.
    expect(src).toMatch(/function clearFilters\(\) \{\n(?:(?!\n  \}).)*\n\s*tool<HTMLInputElement>\("ph-q"\)\.focus\(\);\n  \}/s);
    // A project made while a filter is on is not hidden by it.
    expect(src).toMatch(/f = \{ \.\.\.DEFAULT_FILTER \};\s*syncTools\(\);\s*await load\(\);\s*open\(created\.key\)/);
    // Nothing loaded: no Clear button over "No projects yet".
    expect(src).toContain('isDefaultFilter(f) || !projects.length ? "none" : ""');
  });
  it("each titled group header is a toggle button: chevron, aria-expanded, its count; collapses kept in memory", () => {
    expect(src).toContain("const collapsed = new Set<string>()");
    expect(src).toMatch(/<button class="ph-group" data-group="\$\{esc\(g\.id\)\}" aria-expanded="\$\{shown \? "true" : "false"\}"/);
    expect(src).toContain('shown ? "▾" : "▸"');
    expect(src).toContain("groupShown(g.id, collapsed, f.q)");
    expect(src).toContain("${esc(g.title)} · ${esc(g.rows.length)}");
    expect(src).toContain("toggleGroup(collapsed, ");
    // The untitled group (no offices) gets no toggle.
    expect(src).toMatch(/g\.id\s*\?\s*`<button class="ph-group"/);
  });
  it("fits a narrow panel: the header wraps, the cards never pass the edge", () => {
    expect(src).toContain("minmax(min(13rem,100%),1fr)");
    expect(src).toMatch(/<div id="ph-head" style="display:flex;flex-wrap:wrap;/);
    expect(src).toContain('class="ph-card"');
    expect(src).toMatch(/class="ph-card"[^`]*min-width:0/);
  });
  it("keeps filter state in memory only", () => {
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
